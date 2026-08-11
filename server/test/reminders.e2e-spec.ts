import request from 'supertest';
import type { Server } from 'node:http';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 6 acceptance: reminders and notifications.
 *
 * The behaviour that matters is idempotence — a bill reminder that arrives
 * twice is worse than one that arrives a few hours late, and the spec calls
 * out the case where a user edits the offset after this cycle already fired.
 */
describe('Reminders (e2e)', () => {
  let harness: Harness;
  let server: Server;

  beforeAll(async () => {
    process.env.LLM_DRIVER = 'fake';
    process.env.QUEUE_DRIVER = 'inline';
    harness = await createHarness();
    server = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.close();
    delete process.env.LLM_DRIVER;
    delete process.env.QUEUE_DRIVER;
  });

  async function setup(email = 'aarav@example.com') {
    const password = 'Kirana@2026';
    await request(server)
      .post('/api/v1/auth/signup')
      .send({ email, password, displayName: 'Aarav' })
      .expect(202);

    const user = await harness.prisma.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: true },
    });
    await harness.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    harness.resetThrottle();

    return {
      token: login.body.accessToken as string,
      profileId: user.memberships[0]!.profileId,
    };
  }

  /**
   * A card whose bill is due in three days, so the default reminder fires now.
   * Statement and due days are derived from today rather than fixed, so the
   * test doesn't rot as the calendar moves.
   */
  async function cardDueInDays(profileId: string, days: number) {
    const due = new Date(Date.now() + days * 86_400_000);
    const statement = new Date(due.getTime() - 15 * 86_400_000);

    return harness.prisma.account.create({
      data: {
        profileId,
        type: 'CREDIT_CARD',
        name: 'HDFC Millennia',
        balanceMinor: 23_480_00n,
        creditLimitMinor: 2_00_000_00n,
        statementDay: statement.getUTCDate(),
        dueDay: due.getUTCDate(),
      },
    });
  }

  describe('configuration', () => {
    it('stores the offset, time and channels — design 6h', async () => {
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      const res = await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3, timeOfDay: 540, channels: ['EMAIL', 'PUSH'] })
        .expect(200);

      expect(res.body.offsetDays).toBe(3);
      expect(res.body.timeOfDay).toBe(540);
      expect(res.body.channels).toEqual(['EMAIL', 'PUSH']);
      expect(res.body.enabled).toBe(true);
    });

    it('replaces rather than duplicating', async () => {
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      for (const offsetDays of [3, 5]) {
        await request(server)
          .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
          .set('Authorization', `Bearer ${token}`)
          .send({ offsetDays })
          .expect(200);
      }

      const stored = await harness.prisma.reminder.findMany({
        where: { accountId: account.id },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0]?.offsetDays).toBe(5);
    });

    it('rejects an impossible time of day', async () => {
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ timeOfDay: 1500 })
        .expect(400);
    });

    it('404s on another profile`s account', async () => {
      const aarav = await setup('aarav@example.com');
      const meera = await setup('meera@example.com');
      const account = await cardDueInDays(aarav.profileId, 3);

      await request(server)
        .put(
          `/api/v1/profiles/${meera.profileId}/accounts/${account.id}/reminders`,
        )
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ offsetDays: 3 })
        .expect(404);
    });
  });

  describe('the scan', () => {
    it('fires once and raises an in-app banner', async () => {
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3, timeOfDay: 0 })
        .expect(200);

      const run = await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(run.body.fired).toBe(1);

      const banners = await request(server)
        .get(`/api/v1/profiles/${profileId}/notifications`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(banners.body).toHaveLength(1);
      expect(banners.body[0].kind).toBe('due.soon');
      expect(banners.body[0].title).toContain('HDFC Millennia');
      expect(banners.body[0].severity).toBe('WARNING');
    });

    it('sends nothing on a second run the same cycle', async () => {
      // A bill reminder arriving twice is worse than one arriving late.
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3, timeOfDay: 0 })
        .expect(200);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const second = await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(second.body.fired).toBe(0);
      expect(
        await harness.prisma.notification.count({ where: { profileId } }),
      ).toBe(1);
    });

    it('does not re-fire when the offset is edited mid-cycle', async () => {
      // The spec's own edge case, and the reason the scan keys on the billing
      // cycle rather than on today's date.
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3, timeOfDay: 0 })
        .expect(200);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // User nudges the offset.
      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 7, timeOfDay: 0 })
        .expect(200);

      const after = await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(after.body.fired).toBe(0);
      expect(
        await harness.prisma.notification.count({ where: { profileId } }),
      ).toBe(1);
    });

    it('stays quiet while the send time is still ahead', async () => {
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 20);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3 })
        .expect(200);

      const run = await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(run.body.fired).toBe(0);
      expect(run.body.skipped).toBe(1);
    });

    it('ignores a settled card', async () => {
      // Nothing owed, nothing to remind about.
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);
      await harness.prisma.account.update({
        where: { id: account.id },
        data: { balanceMinor: 0n },
      });

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3, timeOfDay: 0 })
        .expect(200);

      const run = await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(run.body.fired).toBe(0);
    });

    it('ignores a disabled reminder', async () => {
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3, timeOfDay: 0, enabled: false })
        .expect(200);

      const run = await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(run.body.scanned).toBe(0);
    });

    it('reminds about a loan EMI', async () => {
      const { token, profileId } = await setup();

      // Anchored so the 99th EMI falls ten days from now. A fixed date would
      // silently stop testing anything as the calendar moved past it — the
      // first version of this test had a next-EMI date fifty days in the
      // past, which the scan correctly ignored as beyond the overdue grace.
      const emisPaid = 98;
      const nextEmi = new Date(Date.now() + 10 * 86_400_000);
      const firstEmiDate = new Date(
        Date.UTC(
          nextEmi.getUTCFullYear(),
          nextEmi.getUTCMonth() - emisPaid,
          nextEmi.getUTCDate(),
        ),
      );

      const loan = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'LOAN',
          name: 'Home loan',
          principalMinor: 60_00_000_00n,
          interestRate: 8.4,
          tenureMonths: 240,
          emisPaid,
          firstEmiDate,
        },
      });

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${loan.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 30, timeOfDay: 0 })
        .expect(200);

      const run = await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(run.body.fired).toBe(1);

      const banners = await harness.prisma.notification.findMany({
        where: { profileId },
      });
      expect(banners[0]?.title).toContain('Home loan');
    });

    it('survives a half-configured loan', async () => {
      const { token, profileId } = await setup();
      const loan = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'LOAN',
          name: 'Incomplete',
          principalMinor: 1n,
        },
      });

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${loan.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3 })
        .expect(200);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
    });
  });

  describe('notifications', () => {
    it('counts unread and clears on read', async () => {
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3, timeOfDay: 0 })
        .expect(200);
      await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const before = await request(server)
        .get(`/api/v1/profiles/${profileId}/notifications/unread-count`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(before.body.unread).toBe(1);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/notifications/read-all`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const after = await request(server)
        .get(`/api/v1/profiles/${profileId}/notifications/unread-count`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(after.body.unread).toBe(0);
    });

    it('filters to unread only', async () => {
      const { token, profileId } = await setup();
      const account = await cardDueInDays(profileId, 3);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${account.id}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 3, timeOfDay: 0 })
        .expect(200);
      await request(server)
        .post(`/api/v1/profiles/${profileId}/reminders/scan`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      await request(server)
        .post(`/api/v1/profiles/${profileId}/notifications/read-all`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const unread = await request(server)
        .get(`/api/v1/profiles/${profileId}/notifications`)
        .query({ unreadOnly: true })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(unread.body).toHaveLength(0);

      const all = await request(server)
        .get(`/api/v1/profiles/${profileId}/notifications`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(all.body).toHaveLength(1);
    });

    it('404s on another profile`s notification', async () => {
      const aarav = await setup('aarav@example.com');
      const meera = await setup('meera@example.com');

      const notification = await harness.prisma.notification.create({
        data: { profileId: aarav.profileId, kind: 'due.soon', title: 'Theirs' },
      });

      await request(server)
        .post(
          `/api/v1/profiles/${meera.profileId}/notifications/${notification.id}/read`,
        )
        .set('Authorization', `Bearer ${meera.token}`)
        .expect(404);
    });
  });

  describe('partial edits', () => {
    it('keeps the fields the caller did not send', async () => {
      const { token, profileId } = await setup();
      const { id: accountId } = await cardDueInDays(profileId, 10);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${accountId}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 7, timeOfDay: 1200, enabled: true })
        .expect(200);

      // The UI switches the reminder off with this body alone.
      const off = await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${accountId}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: false })
        .expect(200);

      // Filling the gaps with defaults would have reset "a week before, 8 pm"
      // to "3 days before, 9 am" — a schedule the user never chose.
      expect(off.body.offsetDays).toBe(7);
      expect(off.body.timeOfDay).toBe(1200);
      expect(off.body.enabled).toBe(false);
    });

    it('returns the reminder as a list the UI can unwrap', async () => {
      const { token, profileId } = await setup();
      const { id: accountId } = await cardDueInDays(profileId, 10);

      await request(server)
        .put(`/api/v1/profiles/${profileId}/accounts/${accountId}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .send({ offsetDays: 5 })
        .expect(200);

      const read = await request(server)
        .get(`/api/v1/profiles/${profileId}/accounts/${accountId}/reminders`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // An array, not an object — the web client read `.enabled` off this
      // directly and got undefined, so the switch could never show as on.
      expect(Array.isArray(read.body)).toBe(true);
      expect(read.body[0].offsetDays).toBe(5);
    });
  });
});
