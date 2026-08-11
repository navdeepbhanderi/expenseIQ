import request from 'supertest';
import type { Server } from 'node:http';
import { createHarness, type Harness } from './app-harness';
import { RecurrenceGeneratorService } from '@/modules/recurring/recurrence-generator.service';

/**
 * Schedules that end, and schedules that know which day they mean.
 *
 * Two gaps this covers, both of which made the feature wrong rather than
 * merely incomplete:
 *
 * 1. A rule ran forever. There was no way to express a six-month EMI or a
 *    lease with a known end, so the only way to stop one was to remember to
 *    delete it - and forgetting meant phantom entries in the review queue for
 *    a loan that was already paid off.
 * 2. A day-of-month is the whole answer for MONTHLY and no answer at all for
 *    WEEKLY or YEARLY. "The 15th, every year" silently meant whichever month
 *    the form was submitted in.
 */
describe('Recurring schedules (e2e)', () => {
  let harness: Harness;
  let server: Server;

  beforeAll(async () => {
    harness = await createHarness();
    server = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.close();
  });

  async function createUser(email = 'aarav@example.com') {
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

  const generator = () =>
    harness.app.get(RecurrenceGeneratorService, { strict: false });

  const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  /** Drives the generator forwards one due date at a time. */
  async function runOn(profileId: string, dates: string[]) {
    for (const date of dates) {
      await generator().generateDue(profileId, at(date));
    }
  }

  describe('a fixed number of instalments', () => {
    it('stops after the last one and retires the rule', async () => {
      const { token, profileId } = await createUser();

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/manual`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 12_500_00,
          cadence: 'MONTHLY',
          dayOfMonth: 5,
          direction: 'DEBIT',
          label: 'Laptop EMI',
          maxOccurrences: 3,
        })
        .expect(201);

      // Seed a known starting point so the assertion does not depend on the
      // month the suite happens to run in.
      await harness.prisma.recurringRule.update({
        where: { id: created.body.id },
        data: { nextDueDate: at('2026-01-05') },
      });

      // Four runs against a three-instalment rule.
      await runOn(profileId, [
        '2026-01-05',
        '2026-02-05',
        '2026-03-05',
        '2026-04-05',
      ]);

      const rule = await harness.prisma.recurringRule.findUniqueOrThrow({
        where: { id: created.body.id },
      });

      expect(rule.occurrenceCount).toBe(3);
      // Retired rather than deleted - a paid-off loan is still history.
      expect(rule.enabled).toBe(false);
      expect(rule.nextDueDate).toBeNull();

      const staged = await harness.prisma.reviewQueueItem.count({
        where: { profileId, source: 'RECURRING' },
      });
      expect(staged).toBe(3);
    });

    it('does not consume an instalment on a repeated run', async () => {
      const { token, profileId } = await createUser();

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/manual`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 5_000_00,
          cadence: 'MONTHLY',
          dayOfMonth: 5,
          maxOccurrences: 6,
        })
        .expect(201);

      await harness.prisma.recurringRule.update({
        where: { id: created.body.id },
        data: { nextDueDate: at('2026-01-05') },
      });

      /*
       * The same date twice, as a retried job or a double-fired cron would.
       *
       * The second run hits the idempotency index and stages nothing, so it
       * must not tick the counter - otherwise a scheduler hiccup silently
       * ends a 6-EMI loan two instalments early.
       */
      await runOn(profileId, ['2026-01-05', '2026-01-05']);

      const rule = await harness.prisma.recurringRule.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(rule.occurrenceCount).toBe(1);
      expect(rule.enabled).toBe(true);
    });
  });

  describe('an end date', () => {
    it('stages the final due date and nothing past it', async () => {
      const { token, profileId } = await createUser();

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/manual`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 28_000_00,
          cadence: 'MONTHLY',
          dayOfMonth: 1,
          label: 'Rent, lease ends March',
          endsOn: '2026-03-01',
        })
        .expect(201);

      await harness.prisma.recurringRule.update({
        where: { id: created.body.id },
        data: { nextDueDate: at('2026-01-01') },
      });

      await runOn(profileId, ['2026-01-01', '2026-02-01', '2026-03-01']);

      const items = await harness.prisma.reviewQueueItem.findMany({
        where: { profileId, source: 'RECURRING' },
        orderBy: { parsedDate: 'asc' },
      });

      // The end date is inclusive: March rent is owed, April is not.
      expect(items).toHaveLength(3);
      expect(items[2]!.parsedDate).toEqual(at('2026-03-01'));

      const rule = await harness.prisma.recurringRule.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(rule.enabled).toBe(false);
    });

    it('revives a retired rule when the end date is extended', async () => {
      const { token, profileId } = await createUser();

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/manual`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 1_000_00, cadence: 'MONTHLY', dayOfMonth: 1 })
        .expect(201);

      await harness.prisma.recurringRule.update({
        where: { id: created.body.id },
        data: { enabled: false, nextDueDate: null },
      });

      // Editing the schedule is the user saying "keep going" - a rule that
      // stayed disabled would make "extend by six months" do nothing at all.
      await request(server)
        .patch(`/api/v1/profiles/${profileId}/recurring/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dayOfMonth: 1, endsOn: '2027-06-01' })
        .expect(200);

      const rule = await harness.prisma.recurringRule.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(rule.enabled).toBe(true);
      expect(rule.nextDueDate).not.toBeNull();
    });
  });

  describe('anchors', () => {
    it('puts a yearly rule in the month asked for, not the month created', async () => {
      const { token, profileId } = await createUser();

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/manual`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 18_000_00,
          cadence: 'YEARLY',
          dayOfMonth: 15,
          monthOfYear: 3,
          label: 'Car insurance',
        })
        .expect(201);

      expect(created.body.monthOfYear).toBe(3);
      expect(new Date(created.body.nextDueDate).getUTCMonth()).toBe(2);
      expect(new Date(created.body.nextDueDate).getUTCDate()).toBe(15);
    });

    it('puts a weekly rule on the chosen weekday', async () => {
      const { token, profileId } = await createUser();

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/manual`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 600_00,
          cadence: 'WEEKLY',
          dayOfWeek: 5,
          label: 'Weekly groceries',
        })
        .expect(201);

      expect(new Date(created.body.nextDueDate).getUTCDay()).toBe(5);
    });

    it('rejects a weekday outside 0-6', async () => {
      const { token, profileId } = await createUser();

      await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/manual`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 100_00, cadence: 'WEEKLY', dayOfWeek: 7 })
        .expect(400);
    });
  });

  describe('the 31st', () => {
    it('recovers after a short month instead of sticking to the 28th', async () => {
      const { token, profileId } = await createUser();

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/manual`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 2_000_00, cadence: 'MONTHLY', dayOfMonth: 31 })
        .expect(201);

      await harness.prisma.recurringRule.update({
        where: { id: created.body.id },
        data: { nextDueDate: at('2026-01-31') },
      });

      await runOn(profileId, ['2026-01-31', '2026-02-28']);

      const rule = await harness.prisma.recurringRule.findUniqueOrThrow({
        where: { id: created.body.id },
      });

      // Advancing from the clamped 28 February used to yield 28 March and
      // stay there for good.
      expect(rule.nextDueDate).toEqual(at('2026-03-31'));
    });
  });
});
