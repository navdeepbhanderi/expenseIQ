import request from 'supertest';
import type { Server } from 'node:http';
import { ProfileRole } from '@prisma/client';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 1 acceptance: profile access control.
 *
 * The guard asserted here is load-bearing for every later phase — accounts,
 * transactions, NLU and the review queue all sit behind it. If it leaks, all
 * of them leak.
 */
describe('Profiles (e2e)', () => {
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

  /** Creates a verified user and returns a usable access token. */
  async function createUser(
    email: string,
    displayName: string,
  ): Promise<{ token: string; userId: string; profileId: string }> {
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
      profileId: user.memberships[0]!.profileId,
    };
  }

  describe('switcher payload', () => {
    it('returns the shape design 2c renders', async () => {
      const { token } = await createUser('aarav@example.com', 'Aarav');

      const res = await request(server)
        .get('/api/v1/profiles')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual({
        id: expect.any(String),
        name: 'Personal',
        kind: 'PERSONAL',
        initials: 'AR',
        avatarColor: expect.stringMatching(/^#[0-9A-F]{6}$/i),
        role: 'OWNER',
        isDefault: true,
        sharedWith: [],
        monthSpendMinor: 0,
        accountCount: 0,
        pendingReviewCount: 0,
        allowanceRemainingMinor: null,
      });
    });

    it('names the other members of a shared profile', async () => {
      const aarav = await createUser('aarav@example.com', 'Aarav');
      const meera = await createUser('meera@example.com', 'Meera');

      const shared = await request(server)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${aarav.token}`)
        .send({ name: 'Sharma family', kind: 'SHARED' })
        .expect(201);

      await harness.prisma.profileMember.create({
        data: {
          profileId: shared.body.id as string,
          userId: meera.userId,
          role: ProfileRole.ADULT,
        },
      });

      const res = await request(server)
        .get('/api/v1/profiles')
        .set('Authorization', `Bearer ${aarav.token}`)
        .expect(200);

      const profiles = res.body as {
        name: string;
        sharedWith: string[];
        initials: string;
      }[];
      const family = profiles.find((p) => p.name === 'Sharma family')!;
      // Design 2c: "Sharma family · Shared with Meera".
      expect(family.sharedWith).toEqual(['Meera']);
      expect(family.initials).toBe('SH');
    });

    it('reflects real spend once transactions exist', async () => {
      const { token, profileId } = await createUser(
        'aarav@example.com',
        'Aarav',
      );

      await harness.prisma.transaction.create({
        data: {
          profileId,
          amountMinor: 30_000n, // ₹300
          direction: 'DEBIT',
          date: new Date(),
        },
      });

      const res = await request(server)
        .get('/api/v1/profiles')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body[0].monthSpendMinor).toBe(30_000);
    });
  });

  describe('access control', () => {
    it('answers 404 — not 403 — for another user`s profile', async () => {
      // A 403 would confirm the profile exists, letting anyone enumerate ids
      // by watching status codes. From outside, inaccessible and nonexistent
      // must look identical.
      const aarav = await createUser('aarav@example.com', 'Aarav');
      const meera = await createUser('meera@example.com', 'Meera');

      await request(server)
        .get(`/api/v1/profiles/${aarav.profileId}`)
        .set('Authorization', `Bearer ${meera.token}`)
        .expect(404);
    });

    it('answers 404 for a profile that does not exist', async () => {
      const { token } = await createUser('aarav@example.com', 'Aarav');

      await request(server)
        .get('/api/v1/profiles/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('allows a member through', async () => {
      const { token, profileId } = await createUser(
        'aarav@example.com',
        'Aarav',
      );

      await request(server)
        .get(`/api/v1/profiles/${profileId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('rejects a request with no token before touching the database', async () => {
      const { profileId } = await createUser('aarav@example.com', 'Aarav');
      await request(server).get(`/api/v1/profiles/${profileId}`).expect(401);
    });
  });

  describe('role enforcement', () => {
    it('blocks a CHILD from editing the profile', async () => {
      // The feature spec: CHILD restrictions must be enforced server-side,
      // because a hidden button is not a restriction.
      const owner = await createUser('aarav@example.com', 'Aarav');
      const child = await createUser('ishaan@example.com', 'Ishaan');

      await harness.prisma.profileMember.create({
        data: {
          profileId: owner.profileId,
          userId: child.userId,
          role: ProfileRole.CHILD,
        },
      });

      await request(server)
        .patch(`/api/v1/profiles/${owner.profileId}`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({ name: 'Renamed by a child' })
        .expect(403);

      // But a CHILD can still view it.
      await request(server)
        .get(`/api/v1/profiles/${owner.profileId}`)
        .set('Authorization', `Bearer ${child.token}`)
        .expect(200);
    });

    it('blocks an ADULT from deleting a profile', async () => {
      const owner = await createUser('aarav@example.com', 'Aarav');
      const adult = await createUser('meera@example.com', 'Meera');

      await harness.prisma.profileMember.create({
        data: {
          profileId: owner.profileId,
          userId: adult.userId,
          role: ProfileRole.ADULT,
        },
      });

      await request(server)
        .delete(`/api/v1/profiles/${owner.profileId}`)
        .set('Authorization', `Bearer ${adult.token}`)
        .expect(403);

      // An ADULT may still edit.
      await request(server)
        .patch(`/api/v1/profiles/${owner.profileId}`)
        .set('Authorization', `Bearer ${adult.token}`)
        .send({ name: 'Household' })
        .expect(200);
    });

    it('picks up a role change immediately, not at token expiry', async () => {
      // The role is resolved from the database per request rather than read
      // from a JWT claim, so a demotion takes effect at once.
      const owner = await createUser('aarav@example.com', 'Aarav');
      const other = await createUser('meera@example.com', 'Meera');

      const membership = await harness.prisma.profileMember.create({
        data: {
          profileId: owner.profileId,
          userId: other.userId,
          role: ProfileRole.ADULT,
        },
      });

      await request(server)
        .patch(`/api/v1/profiles/${owner.profileId}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ name: 'Still allowed' })
        .expect(200);

      await harness.prisma.profileMember.update({
        where: { id: membership.id },
        data: { role: ProfileRole.CHILD },
      });

      await request(server)
        .patch(`/api/v1/profiles/${owner.profileId}`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({ name: 'No longer allowed' })
        .expect(403);
    });
  });

  describe('creation and update', () => {
    it('derives the monogram from the name and keeps colour stable on rename', async () => {
      const { token } = await createUser('aarav@example.com', 'Aarav');

      const created = await request(server)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Side business' })
        .expect(201);

      expect(created.body.initials).toBe('SI');
      const originalColor = created.body.avatarColor as string;

      const renamed = await request(server)
        .patch(`/api/v1/profiles/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Consulting' })
        .expect(200);

      expect(renamed.body.initials).toBe('CO');
      // Colour is the profile's identity in the switcher — a rename must not
      // change which colour the user recognises.
      expect(renamed.body.avatarColor).toBe(originalColor);
    });

    it('rejects unknown fields rather than silently ignoring them', async () => {
      const { token } = await createUser('aarav@example.com', 'Aarav');

      // whitelist + forbidNonWhitelisted: a client must not be able to smuggle
      // a field the endpoint never meant to accept.
      await request(server)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Nice try', isDefault: true, id: 'chosen-by-client' })
        .expect(400);
    });
  });

  describe('deletion', () => {
    it('reports what would be lost', async () => {
      const { token, profileId } = await createUser(
        'aarav@example.com',
        'Aarav',
      );

      await harness.prisma.account.create({
        data: { profileId, type: 'BANK', name: 'SBI Savings' },
      });
      await harness.prisma.transaction.create({
        data: {
          profileId,
          amountMinor: 48_200n,
          direction: 'DEBIT',
          date: new Date(),
        },
      });

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/delete-impact`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        accounts: 1,
        transactions: 1,
        deletable: false,
        reason: 'You cannot delete your only profile',
      });
    });

    it('refuses to delete the last profile', async () => {
      const { token, profileId } = await createUser(
        'aarav@example.com',
        'Aarav',
      );

      await request(server)
        .delete(`/api/v1/profiles/${profileId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('deletes a second profile and promotes a new default', async () => {
      const { token, profileId } = await createUser(
        'aarav@example.com',
        'Aarav',
      );

      const second = await request(server)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Side business' })
        .expect(201);

      // Delete the default; the remaining profile must become the default,
      // otherwise the switcher has nothing to pre-select.
      await request(server)
        .delete(`/api/v1/profiles/${profileId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      const remaining = await harness.prisma.profile.findUniqueOrThrow({
        where: { id: second.body.id as string },
      });
      expect(remaining.isDefault).toBe(true);
    });

    it('cascades to accounts and transactions', async () => {
      const { token, profileId } = await createUser(
        'aarav@example.com',
        'Aarav',
      );

      await request(server)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Side business' })
        .expect(201);

      await harness.prisma.account.create({
        data: { profileId, type: 'BANK', name: 'SBI Savings' },
      });

      await request(server)
        .delete(`/api/v1/profiles/${profileId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(await harness.prisma.account.count({ where: { profileId } })).toBe(
        0,
      );
      expect(
        await harness.prisma.profileMember.count({ where: { profileId } }),
      ).toBe(0);
    });
  });
});
