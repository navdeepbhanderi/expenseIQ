import request from 'supertest';
import type { Server } from 'node:http';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 8 acceptance: the guarantees that hold across every endpoint rather
 * than within any one of them.
 *
 * These are the properties that decay silently. Nobody notices a missing
 * security header or a leaked password hash while adding a feature, because
 * no feature test asserts them — so they get asserted here, once, against the
 * real pipeline.
 */
describe('Hardening (e2e)', () => {
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
      userId: user.id,
      password,
    };
  }

  describe('security headers', () => {
    it('sets the headers that protect an API client', async () => {
      const response = await request(server).get('/api/v1/health').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['referrer-policy']).toBeDefined();
    });

    it('does not advertise the framework', async () => {
      // x-powered-by tells an attacker what to look up CVEs for, and costs
      // nothing to remove.
      const response = await request(server).get('/api/v1/health').expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('request body limits', () => {
    it('rejects an oversized body instead of parsing it into memory', async () => {
      // The validation pipe only runs after the body is fully parsed, so a
      // size limit is the only thing standing between an unauthenticated
      // caller and however much memory they care to allocate.
      const huge = 'x'.repeat(2 * 1024 * 1024);

      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'aarav@example.com', password: huge });

      expect(response.status).toBe(413);
    });

    it('applies the configured limit, not the framework default', async () => {
      // 150kb sits above Nest's built-in 100kb default and below our 256kb.
      // If this 413s, useBodyParser never took effect and the configured
      // limit is dead code — which is exactly what app.use(express.json())
      // did before, because Nest's parser had already claimed the body.
      const payload = 'x'.repeat(150 * 1024);

      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'aarav@example.com', password: payload });

      expect(response.status).not.toBe(413);
    });
  });

  describe('error envelope', () => {
    // Every error, from any layer, must be the same shape — a client that
    // special-cases per endpoint is a client that breaks on the next one.
    const hasEnvelope = (body: Record<string, unknown>): void => {
      expect(typeof body.statusCode).toBe('number');
      expect(typeof body.error).toBe('string');
      expect(body.message).toBeDefined();
    };

    it('uses the envelope for a 404 from the router', async () => {
      const response = await request(server)
        .get('/api/v1/no-such-route')
        .expect(404);

      hasEnvelope(response.body as Record<string, unknown>);
    });

    it('uses the envelope for a 401 from the auth guard', async () => {
      const response = await request(server).get('/api/v1/auth/me').expect(401);

      hasEnvelope(response.body as Record<string, unknown>);
    });

    it('uses the envelope for a 400 from the validation pipe', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);

      hasEnvelope(response.body as Record<string, unknown>);
      expect(Array.isArray(response.body.message)).toBe(true);
    });

    it('uses the envelope for a 403 from the profile guard', async () => {
      const outsider = await createUser('meera@example.com');
      const owner = await createUser('aarav@example.com');

      const response = await request(server)
        .get(`/api/v1/profiles/${owner.profileId}/transactions`)
        .set('Authorization', `Bearer ${outsider.token}`);

      expect([403, 404]).toContain(response.status);
      hasEnvelope(response.body as Record<string, unknown>);
    });

    it('carries a requestId a user can quote back', async () => {
      const response = await request(server)
        .get('/api/v1/no-such-route')
        .expect(404);

      expect(typeof response.body.requestId).toBe('string');
    });
  });

  describe('input rejection', () => {
    it('strips unknown properties rather than passing them to the ORM', async () => {
      // whitelist + forbidNonWhitelisted. Without it, POSTing a field the DTO
      // never declared could reach Prisma — role escalation by request body.
      const response = await request(server)
        .post('/api/v1/auth/signup')
        .send({
          email: 'newuser@example.com',
          password: 'Kirana@2026',
          displayName: 'New',
          emailVerified: true,
          role: 'OWNER',
        })
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(
        /emailVerified|role|should not exist/i,
      );
    });

    it('rejects a malformed uuid in a path parameter', async () => {
      const { token } = await createUser();

      const response = await request(server)
        .get('/api/v1/profiles/not-a-uuid/transactions')
        .set('Authorization', `Bearer ${token}`);

      expect([400, 403, 404]).toContain(response.status);
      expect(response.status).not.toBe(500);
    });
  });

  describe('secret leakage', () => {
    it('never returns a password hash from any auth endpoint', async () => {
      const { token } = await createUser();

      const me = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const serialised = JSON.stringify(me.body);
      expect(serialised).not.toMatch(/passwordHash|\$2[aby]\$/);
    });

    it('does not leak whether an email is registered on failed login', async () => {
      // Same status and same message either way. A different response for a
      // known address turns the login form into an account enumerator.
      await createUser('aarav@example.com');
      harness.resetThrottle();

      const known = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'aarav@example.com', password: 'WrongPassword@1' });

      const unknown = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'WrongPassword@1' });

      expect(known.status).toBe(unknown.status);
      expect(known.body.message).toEqual(unknown.body.message);
    });

    it('does not leak an internal error message to the client', async () => {
      const response = await request(server)
        .get('/api/v1/no-such-route')
        .expect(404);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toMatch(
        /prisma|postgres|at Object\.|node_modules/i,
      );
    });
  });

  describe('rate limiting', () => {
    it('throttles repeated login attempts', async () => {
      await createUser();
      harness.resetThrottle();

      let throttled = false;
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const response = await request(server)
          .post('/api/v1/auth/login')
          .send({ email: 'aarav@example.com', password: 'WrongPassword@1' });

        if (response.status === 429) {
          throttled = true;
          break;
        }
      }

      expect(throttled).toBe(true);
      harness.resetThrottle();
    });
  });
});
