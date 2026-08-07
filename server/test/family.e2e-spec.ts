import request from 'supertest';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import { ProfileRole } from '@prisma/client';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 7 acceptance: family membership, parental controls and goals.
 *
 * The phase's stated deliverable is one sentence from the spec: a CHILD
 * profile hitting a restricted endpoint *directly via the API* gets 403, not
 * a hidden button. Most of what follows tests exactly that.
 */
describe('Family (e2e)', () => {
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
    await harness.prisma.category.createMany({
      data: [
        {
          profileId: null,
          name: 'Groceries',
          monogram: 'GR',
          tint: '#E7F0EA',
          isSystem: true,
          sortOrder: 0,
        },
        {
          profileId: null,
          name: 'Eating out',
          monogram: 'EA',
          tint: '#F6E5E1',
          isSystem: true,
          sortOrder: 1,
        },
        {
          profileId: null,
          name: 'Income',
          monogram: 'IN',
          tint: '#E7F0EA',
          isSystem: true,
          isIncome: true,
          sortOrder: 2,
        },
      ],
    });
  });

  afterAll(async () => {
    await harness.close();
    delete process.env.LLM_DRIVER;
    delete process.env.QUEUE_DRIVER;
  });

  async function setup(email: string, displayName: string) {
    const password = 'Kirana@2026';
    await request(server)
      .post('/api/v1/auth/signup')
      .send({ email, password, displayName })
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
      userId: user.id,
      email,
      profileId: user.memberships[0]!.profileId,
    };
  }

  /** Invites someone and returns the raw token, as the email would carry it. */
  async function inviteAndCaptureToken(
    owner: { token: string; profileId: string },
    email: string,
    role: ProfileRole,
  ): Promise<string> {
    await request(server)
      .post(`/api/v1/profiles/${owner.profileId}/members/invite`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email, role })
      .expect(201);

    // Only the hash is stored, so mint a known token for the test.
    const invite = await harness.prisma.profileInvite.findFirstOrThrow({
      where: { profileId: owner.profileId, email, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const raw = `token-${invite.id}`;
    await harness.prisma.profileInvite.update({
      where: { id: invite.id },
      data: { tokenHash: createHash('sha256').update(raw).digest('hex') },
    });

    return raw;
  }

  /** An owner's profile with a child joined to it. */
  async function household() {
    const owner = await setup('aarav@example.com', 'Aarav');
    const child = await setup('ishaan@example.com', 'Ishaan');

    const token = await inviteAndCaptureToken(
      owner,
      child.email,
      ProfileRole.CHILD,
    );

    await request(server)
      .post('/api/v1/family/invites/accept')
      .set('Authorization', `Bearer ${child.token}`)
      .send({ token })
      .expect(201);

    return { owner, child };
  }

  describe('invitations', () => {
    it('invites, accepts, and marks the profile shared', async () => {
      const owner = await setup('aarav@example.com', 'Aarav');
      const meera = await setup('meera@example.com', 'Meera');

      const token = await inviteAndCaptureToken(
        owner,
        meera.email,
        ProfileRole.ADULT,
      );

      const member = await request(server)
        .post('/api/v1/family/invites/accept')
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ token })
        .expect(201);

      expect(member.body.role).toBe('ADULT');

      const profile = await harness.prisma.profile.findUniqueOrThrow({
        where: { id: owner.profileId },
      });
      // Design 2c renders a shared profile differently — the kind has to keep
      // up with reality rather than being set once at creation.
      expect(profile.kind).toBe('SHARED');

      const members = await request(server)
        .get(`/api/v1/profiles/${owner.profileId}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(members.body).toHaveLength(2);
    });

    it('refuses an invite sent to a different address', async () => {
      // A token alone cannot be the only credential for access to a family's
      // finances — an intercepted link would otherwise be enough.
      const owner = await setup('aarav@example.com', 'Aarav');
      const meera = await setup('meera@example.com', 'Meera');
      const someoneElse = await setup('rahul@example.com', 'Rahul');

      const token = await inviteAndCaptureToken(
        owner,
        meera.email,
        ProfileRole.ADULT,
      );

      await request(server)
        .post('/api/v1/family/invites/accept')
        .set('Authorization', `Bearer ${someoneElse.token}`)
        .send({ token })
        .expect(403);
    });

    it('refuses an expired invite', async () => {
      const owner = await setup('aarav@example.com', 'Aarav');
      const meera = await setup('meera@example.com', 'Meera');
      const token = await inviteAndCaptureToken(
        owner,
        meera.email,
        ProfileRole.ADULT,
      );

      await harness.prisma.profileInvite.updateMany({
        where: { profileId: owner.profileId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(server)
        .post('/api/v1/family/invites/accept')
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ token })
        .expect(400);
    });

    it('cannot be replayed', async () => {
      const owner = await setup('aarav@example.com', 'Aarav');
      const meera = await setup('meera@example.com', 'Meera');
      const token = await inviteAndCaptureToken(
        owner,
        meera.email,
        ProfileRole.ADULT,
      );

      await request(server)
        .post('/api/v1/family/invites/accept')
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ token })
        .expect(201);

      await request(server)
        .post('/api/v1/family/invites/accept')
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ token })
        .expect(400);
    });

    it('only an owner may invite', async () => {
      const { owner, child } = await household();

      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/members/invite`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({ email: 'someone@example.com' })
        .expect(403);
    });
  });

  describe('role changes', () => {
    it('promotes a member', async () => {
      const { owner, child } = await household();

      const members = await request(server)
        .get(`/api/v1/profiles/${owner.profileId}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      const childMember = (
        members.body as { userId: string; id: string }[]
      ).find((m) => m.userId === child.userId)!;

      const updated = await request(server)
        .patch(`/api/v1/profiles/${owner.profileId}/members/${childMember.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ role: 'ADULT' })
        .expect(200);

      expect(updated.body.role).toBe('ADULT');
    });

    it('refuses to demote the last owner', async () => {
      // Otherwise the profile holds live financial data that nobody can
      // administer, invite to, or delete.
      const { owner } = await household();

      const members = await request(server)
        .get(`/api/v1/profiles/${owner.profileId}/members`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      const ownerMember = (
        members.body as { isYou: boolean; id: string }[]
      ).find((m) => m.isYou)!;

      await request(server)
        .patch(`/api/v1/profiles/${owner.profileId}/members/${ownerMember.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ role: 'ADULT' })
        .expect(400);
    });

    it('a child cannot change roles', async () => {
      const { owner, child } = await household();

      const members = await harness.prisma.profileMember.findMany({
        where: { profileId: owner.profileId },
      });
      const target = members.find((m) => m.userId === owner.userId)!;

      await request(server)
        .patch(`/api/v1/profiles/${owner.profileId}/members/${target.id}`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({ role: 'CHILD' })
        .expect(403);
    });
  });

  describe('CHILD restrictions are server-side', () => {
    it('403s on every privileged endpoint', async () => {
      // The phase's stated deliverable, exercised against the API directly
      // rather than through a UI that merely hides the buttons.
      const { owner, child } = await household();
      const base = `/api/v1/profiles/${owner.profileId}`;
      const auth = { Authorization: `Bearer ${child.token}` };

      // Written out rather than dispatched dynamically: a loop indexing into
      // supertest by method name defeats its types, and these four calls are
      // the phase's whole deliverable — worth reading literally.
      await request(server)
        .put(`${base}/spend-limits`)
        .set(auth)
        .send({ overallMinor: 100 })
        .expect(403);

      await request(server)
        .put(`${base}/allowance`)
        .set(auth)
        .send({ amountMinor: 100 })
        .expect(403);

      await request(server).delete(`${base}/allowance`).set(auth).expect(403);

      await request(server)
        .post(`${base}/members/invite`)
        .set(auth)
        .send({ email: 'x@example.com' })
        .expect(403);
    });

    it('403s on linking a credit card, but may still log cash spending', async () => {
      const { owner, child } = await household();

      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/accounts`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({
          type: 'CREDIT_CARD',
          name: 'Sneaky card',
          creditLimitMinor: 1_00_000_00,
          statementDay: 1,
          dueDay: 20,
        })
        .expect(403);

      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/transactions`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({ amountMinor: 5_000, date: '2026-08-05' })
        .expect(201);
    });

    it('may see its own limits but not set them', async () => {
      const { owner, child } = await household();

      await request(server)
        .get(`/api/v1/profiles/${owner.profileId}/spend-limits`)
        .set('Authorization', `Bearer ${child.token}`)
        .expect(200);

      await request(server)
        .put(`/api/v1/profiles/${owner.profileId}/spend-limits`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({ overallMinor: 99_999_00 })
        .expect(403);
    });
  });

  describe('spend limits nudge rather than block', () => {
    it('records the spend and flags it, never refusing the write', async () => {
      // The spec's design rationale: blocking pushes kids to stop logging,
      // which destroys the data the feature exists to produce.
      const { owner, child } = await household();

      await request(server)
        .put(`/api/v1/profiles/${owner.profileId}/spend-limits`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ overallMinor: 1_000_00 })
        .expect(200);

      // Child spends well past the limit.
      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/transactions`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({
          amountMinor: 1_500_00,
          date: new Date().toISOString().slice(0, 10),
        })
        .expect(201);

      const evaluated = await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/spend-limits/evaluate`)
        .set('Authorization', `Bearer ${child.token}`)
        .expect(201);

      expect(evaluated.body.exceeded).toContain('All spending');

      const limits = await request(server)
        .get(`/api/v1/profiles/${owner.profileId}/spend-limits`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      expect(limits.body.overall.status.isOver).toBe(true);
      expect(limits.body.overall.status.usedPercent).toBe(150);
    });

    it('nudges at 80% without flagging it as over', async () => {
      const { owner, child } = await household();

      await request(server)
        .put(`/api/v1/profiles/${owner.profileId}/spend-limits`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ overallMinor: 1_000_00 })
        .expect(200);

      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/transactions`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({
          amountMinor: 850_00,
          date: new Date().toISOString().slice(0, 10),
        })
        .expect(201);

      const evaluated = await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/spend-limits/evaluate`)
        .set('Authorization', `Bearer ${child.token}`)
        .expect(201);

      expect(evaluated.body.approaching).toContain('All spending');
      expect(evaluated.body.exceeded).toEqual([]);
    });
  });

  describe('allowance', () => {
    it('credits once a month and reports what is left — design 2c', async () => {
      const { owner } = await household();

      await request(server)
        .put(`/api/v1/profiles/${owner.profileId}/allowance`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ amountMinor: 1_200_00, dayOfMonth: 1 })
        .expect(200);

      const first = await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/allowance/credit-due`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(201);
      expect(first.body.credited).toBe(true);

      // A scheduler firing twice must not hand out pocket money twice.
      const second = await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/allowance/credit-due`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(201);
      expect(second.body.credited).toBe(false);
      expect(second.body.reason).toBe('already-credited');

      const status = await request(server)
        .get(`/api/v1/profiles/${owner.profileId}/allowance`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      // "₹1,200 allowance · ₹1,200 left" — nothing spent yet.
      expect(status.body.credited.amountMinor).toBe(1_200_00);
      expect(status.body.remaining.amountMinor).toBe(1_200_00);
    });

    it('reduces what is left as the child spends', async () => {
      const { owner, child } = await household();

      await request(server)
        .put(`/api/v1/profiles/${owner.profileId}/allowance`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ amountMinor: 1_200_00, dayOfMonth: 1 })
        .expect(200);
      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/allowance/credit-due`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(201);

      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/transactions`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({
          amountMinor: 460_00,
          date: new Date().toISOString().slice(0, 10),
        })
        .expect(201);

      const status = await request(server)
        .get(`/api/v1/profiles/${owner.profileId}/allowance`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      // Design 2c: "₹1,200 allowance · ₹740 left".
      expect(status.body.remaining.amountMinor).toBe(740_00);
    });
  });

  describe('savings goals', () => {
    it('tracks progress and what it takes per month to arrive on time', async () => {
      const { owner } = await household();

      const target = new Date();
      target.setUTCMonth(target.getUTCMonth() + 4);

      const goal = await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/goals`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          name: 'New bicycle',
          targetMinor: 15_000_00,
          targetDate: target.toISOString().slice(0, 10),
        })
        .expect(201);

      expect(goal.body.percentComplete).toBe(0);
      // The number that turns a goal from a wish into a plan.
      expect(goal.body.perMonthToHitTarget.amountMinor).toBe(15_000_00 / 4);
    });

    it('records who contributed — design 6.5 lets an owner chip in', async () => {
      const { owner, child } = await household();

      const goal = await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/goals`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({ name: 'New bicycle', targetMinor: 15_000_00 })
        .expect(201);

      await request(server)
        .post(
          `/api/v1/profiles/${owner.profileId}/goals/${goal.body.goal.id}/contribute`,
        )
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ amountMinor: 5_000_00, note: 'Birthday money' })
        .expect(201);

      const after = await request(server)
        .post(
          `/api/v1/profiles/${owner.profileId}/goals/${goal.body.goal.id}/contribute`,
        )
        .set('Authorization', `Bearer ${child.token}`)
        .send({ amountMinor: 1_000_00 })
        .expect(201);

      expect(after.body.saved.amountMinor).toBe(6_000_00);
      expect(after.body.percentComplete).toBe(40);
      expect(after.body.contributions).toHaveLength(2);
      // Both contributors are distinguishable, which a running total cannot do.
      const byUser = new Set(
        (after.body.contributions as { byUserId: string }[]).map(
          (c) => c.byUserId,
        ),
      );
      expect(byUser.size).toBe(2);
    });

    it('marks a goal achieved once and refuses further contributions', async () => {
      const { owner } = await household();

      const goal = await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/goals`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'Small goal', targetMinor: 1_000_00 })
        .expect(201);

      const done = await request(server)
        .post(
          `/api/v1/profiles/${owner.profileId}/goals/${goal.body.goal.id}/contribute`,
        )
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ amountMinor: 1_000_00 })
        .expect(201);

      expect(done.body.isAchieved).toBe(true);
      expect(done.body.percentComplete).toBe(100);

      await request(server)
        .post(
          `/api/v1/profiles/${owner.profileId}/goals/${goal.body.goal.id}/contribute`,
        )
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ amountMinor: 100 })
        .expect(400);
    });
  });

  describe('family dashboard — design 6.6', () => {
    it('aggregates across every profile the caller belongs to', async () => {
      const { owner, child } = await household();

      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/transactions`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          amountMinor: 10_000_00,
          date: new Date().toISOString().slice(0, 10),
        })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/family/dashboard')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      expect(res.body.householdSpent.amountMinor).toBe(10_000_00);
      expect(res.body.members.length).toBeGreaterThanOrEqual(1);
      expect(res.body.members[0].role).toBe('OWNER');
      expect(res.body.members[0].canSeeDetail).toBe(true);

      // The child sees their own profiles, not the owner's private one.
      const childView = await request(server)
        .get('/api/v1/family/dashboard')
        .set('Authorization', `Bearer ${child.token}`)
        .expect(200);

      const profileIds = (
        childView.body.members as { profileId: string }[]
      ).map((m) => m.profileId);
      expect(profileIds).toContain(owner.profileId);
      expect(profileIds).toContain(child.profileId);
    });
  });
});
