import request from 'supertest';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 1 acceptance: identity and access.
 *
 * The security-relevant behaviours here are the ones worth asserting — a
 * signup flow that "works" is easy, one that doesn't leak which emails are
 * registered and revokes a whole token family on replay is not.
 */
const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

describe('Auth (e2e)', () => {
  let harness: Harness;
  let server: Server;

  const credentials = {
    email: 'aarav@example.com',
    password: 'Kirana@2026',
    displayName: 'Aarav',
  };

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

  /** Signs up, verifies via the token in the database, and logs in. */
  async function registerAndLogin(
    overrides: Partial<typeof credentials> = {},
  ): Promise<{
    accessToken: string;
    /** `name=value` only — safe to send back as a Cookie header. */
    refreshCookie: string;
    /** The full Set-Cookie line, for asserting on attributes. */
    rawSetCookie: string;
    userId: string;
  }> {
    const creds = { ...credentials, ...overrides };

    await request(server).post('/api/v1/auth/signup').send(creds).expect(202);

    const user = await harness.prisma.user.findUniqueOrThrow({
      where: { email: creds.email.toLowerCase() },
    });

    await harness.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: creds.email, password: creds.password })
      .expect(200);

    const raw = (login.headers['set-cookie'] as string[] | undefined) ?? [];

    return {
      accessToken: login.body.accessToken as string,
      refreshCookie: extractRefreshCookie(login),
      rawSetCookie: raw.find((c) => c.startsWith('eiq_refresh=')) ?? '',
      userId: user.id,
    };
  }

  /**
   * A `Cookie` request header carries only `name=value` pairs. Passing the
   * whole `Set-Cookie` line back — attributes and all — makes cookie-parser
   * read `Path`, `HttpOnly` and the `Expires` date as if they were cookies.
   */
  function extractRefreshCookie(response: {
    headers: Record<string, unknown>;
  }) {
    const raw = (response.headers['set-cookie'] as string[] | undefined) ?? [];
    const line = raw.find((cookie) => cookie.startsWith('eiq_refresh='));
    return line?.split(';')[0] ?? '';
  }

  describe('signup', () => {
    it('creates an unverified user with a default profile', async () => {
      await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'aarav@example.com' },
        include: { memberships: { include: { profile: true } } },
      });

      expect(user.emailVerified).toBe(false);
      expect(user.passwordHash).not.toBe(credentials.password);
      expect(user.memberships).toHaveLength(1);

      const membership = user.memberships[0];
      expect(membership?.role).toBe('OWNER');
      expect(membership?.profile.name).toBe('Personal');
      expect(membership?.profile.isDefault).toBe(true);
      // Design 2c: the personal profile's monogram comes from the user's
      // name, not from the word "Personal".
      expect(membership?.profile.initials).toBe('AR');
    });

    it('normalises the email so casing cannot create a second account', async () => {
      await request(server)
        .post('/api/v1/auth/signup')
        .send({ ...credentials, email: '  AARAV@Example.COM ' })
        .expect(202);

      const user = await harness.prisma.user.findUnique({
        where: { email: 'aarav@example.com' },
      });
      expect(user).not.toBeNull();
    });

    it('does not reveal that an address is already registered', async () => {
      const first = await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);

      const second = await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);

      // Identical status and body — the response carries no signal.
      expect(second.body).toEqual(first.body);
      expect(await harness.prisma.user.count()).toBe(1);
    });

    it('rejects a weak password with every failure at once', async () => {
      const res = await request(server)
        .post('/api/v1/auth/signup')
        .send({ email: 'weak@example.com', password: 'abc' })
        .expect(400);

      expect(res.body.details.length).toBeGreaterThanOrEqual(3);
      expect(await harness.prisma.user.count()).toBe(0);
    });

    it('rejects a common password that passes the character rules', async () => {
      await request(server)
        .post('/api/v1/auth/signup')
        .send({ email: 'weak@example.com', password: 'Password1!' })
        .expect(400);
    });
  });

  describe('email verification', () => {
    it('activates the account and cannot be replayed', async () => {
      await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);

      const record = await harness.prisma.emailVerification.findFirstOrThrow(
        {},
      );
      // The raw token is only ever in the email; the DB holds its hash. Mint a
      // known token to exercise the endpoint the way a user would.
      const raw = 'known-verification-token';
      await harness.prisma.emailVerification.update({
        where: { id: record.id },
        data: { tokenHash: createHash('sha256').update(raw).digest('hex') },
      });

      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({ token: raw })
        .expect(200);

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { email: credentials.email },
      });
      expect(user.emailVerified).toBe(true);

      // Replaying a consumed link must fail.
      await request(server)
        .post('/api/v1/auth/verify-email')
        .send({ token: raw })
        .expect(400);
    });

    it('rejects an expired link but flags that a resend is possible', async () => {
      await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);

      const raw = 'expired-token';
      const record = await harness.prisma.emailVerification.findFirstOrThrow(
        {},
      );
      await harness.prisma.emailVerification.update({
        where: { id: record.id },
        data: {
          tokenHash: createHash('sha256').update(raw).digest('hex'),
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const res = await request(server)
        .post('/api/v1/auth/verify-email')
        .send({ token: raw })
        .expect(400);

      expect(res.body.details).toEqual({ canResend: true });
    });

    it('invalidates the previous link when a new one is requested', async () => {
      await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);

      await request(server)
        .post('/api/v1/auth/resend-verification')
        .send({ email: credentials.email })
        .expect(202);

      // Exactly one usable link at a time, so an old email in an inbox can't
      // still activate the account.
      const usable = await harness.prisma.emailVerification.count({
        where: { consumedAt: null },
      });
      expect(usable).toBe(1);
    });
  });

  describe('login', () => {
    it('refuses an unverified account with an actionable message', async () => {
      await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);

      const res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(403);

      expect(res.body.details).toEqual({ canResend: true });
    });

    it('returns the same error for a wrong password and a missing account', async () => {
      await registerAndLogin();

      const wrongPassword = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: 'Wrong@12345' })
        .expect(401);

      const noSuchUser = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'Wrong@12345' })
        .expect(401);

      expect(noSuchUser.body.message).toBe(wrongPassword.body.message);
    });

    it('issues an access token and an httpOnly refresh cookie', async () => {
      const { accessToken, rawSetCookie } = await registerAndLogin();

      expect(accessToken).toBeTruthy();
      // httpOnly is what stops an XSS bug becoming a stolen long-lived session.
      expect(rawSetCookie).toContain('HttpOnly');
      // Scoped so the token isn't attached to every API call.
      expect(rawSetCookie).toContain('Path=/api/v1/auth');
    });
  });

  describe('refresh token rotation', () => {
    it('rotates on use and invalidates the old token', async () => {
      const { refreshCookie } = await registerAndLogin();

      const first = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);

      expect(first.body.accessToken).toBeTruthy();

      // The original token is now spent.
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
    });

    it('revokes the entire family when a spent token is replayed', async () => {
      const { refreshCookie, userId } = await registerAndLogin();

      const rotated = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(200);

      const newCookie = extractRefreshCookie(rotated);

      // Replay the old one — this is the signal that the chain leaked.
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);

      // The legitimate current token must now be dead too: if an attacker has
      // one token from the chain, we cannot tell which side is the thief, so
      // both are cut off and the real user re-authenticates.
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', newCookie)
        .expect(401);

      const live = await harness.prisma.refreshToken.count({
        where: { userId, revokedAt: null },
      });
      expect(live).toBe(0);
    });

    it('logout revokes the family', async () => {
      const { refreshCookie } = await registerAndLogin();

      await request(server)
        .post('/api/v1/auth/logout')
        .set('Cookie', refreshCookie)
        .expect(200);

      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401);
    });

    it('rejects a token that does not exist', async () => {
      await request(server)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401);
    });
  });

  describe('protected routes', () => {
    it('rejects a request with no token', async () => {
      await request(server).get('/api/v1/auth/me').expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer nonsense')
        .expect(401);
    });

    it('accepts a valid access token', async () => {
      const { accessToken, userId } = await registerAndLogin();

      const res = await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ id: userId, email: credentials.email });
    });

    it('stops accepting a token once the account is unverified again', async () => {
      // The token is still cryptographically valid; the strategy re-reads the
      // user, so a state change takes effect immediately rather than at expiry.
      const { accessToken, userId } = await registerAndLogin();

      await harness.prisma.user.update({
        where: { id: userId },
        data: { emailVerified: false },
      });

      await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('stops accepting a token once the account is deleted', async () => {
      const { accessToken, userId } = await registerAndLogin();
      await harness.prisma.user.delete({ where: { id: userId } });

      await request(server)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('google sign-in', () => {
    it('redirects to Google, or reports 501 if this machine has no credentials', async () => {
      // Asserted against the environment rather than a fixed status, because
      // both outcomes are correct and which one applies depends on whether
      // .env carries a client id. The earlier version hardcoded 501 and
      // started failing the moment real credentials were added — a test that
      // breaks on correct configuration is worse than no test.
      const configured = Boolean(process.env.GOOGLE_CLIENT_ID);

      const res = await request(server).get('/api/v1/auth/google');

      if (configured) {
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('accounts.google.com');
      } else {
        // 501, not a 500 with passport's opaque "Unknown strategy".
        expect(res.status).toBe(501);
      }
    });
  });

  describe('rate limiting', () => {
    it('throttles repeated login attempts', async () => {
      // Auth routes allow 10/min, far below the app-wide 120, because these
      // are the endpoints worth brute-forcing. Verified against the real
      // limit — the suite clears counters between tests rather than raising
      // them, so this asserts production behaviour.
      const attempt = () =>
        request(server)
          .post('/api/v1/auth/login')
          .send({ email: 'nobody@example.com', password: 'Whatever@123' });

      const statuses: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        statuses.push((await attempt()).status);
      }

      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    });
  });

  describe('verification status', () => {
    it('reports false before verifying and true after', async () => {
      // Drives design 7d's self-updating page.
      await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);

      const before = await request(server)
        .get('/api/v1/auth/verification-status')
        .query({ email: credentials.email })
        .expect(200);
      expect(before.body.verified).toBe(false);

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { email: credentials.email.toLowerCase() },
      });
      await harness.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });

      const after = await request(server)
        .get('/api/v1/auth/verification-status')
        .query({ email: credentials.email })
        .expect(200);
      expect(after.body.verified).toBe(true);
    });

    it('cannot be used to discover who has an account', async () => {
      // An unknown address answers exactly like an unverified one, so a list
      // of emails learns nothing from this endpoint.
      const unknown = await request(server)
        .get('/api/v1/auth/verification-status')
        .query({ email: 'nobody@example.com' })
        .expect(200);

      expect(unknown.body).toEqual({ verified: false });
    });
  });

  describe('password reset', () => {
    /** Reads the raw token out of the row the request just created. */
    async function requestReset(email: string): Promise<string> {
      await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(202);

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { email: email.toLowerCase() },
      });
      const record = await harness.prisma.passwordReset.findFirstOrThrow({
        where: { userId: user.id, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      // Only the hash is stored, so tests mint a token the same way the
      // service does and overwrite the row to keep the plaintext.
      const raw = 'test-reset-token-' + record.id;
      await harness.prisma.passwordReset.update({
        where: { id: record.id },
        data: { tokenHash: sha256(raw) },
      });

      return raw;
    }

    it('answers identically for known and unknown addresses', async () => {
      // Otherwise this endpoint is a membership check for any email list.
      await registerAndLogin();
      harness.resetThrottle();

      const known = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: credentials.email });

      const unknown = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(known.status).toBe(unknown.status);
      expect(known.body).toEqual(unknown.body);
    });

    it('sets a new password and lets the user log in with it', async () => {
      await registerAndLogin();
      harness.resetThrottle();

      const token = await requestReset(credentials.email);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand@New2026' })
        .expect(200);

      harness.resetThrottle();

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: 'Brand@New2026' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(401);
    });

    it('kills every existing session', async () => {
      /*
       * The property that makes a reset a reset. Someone resets because they
       * fear the old password is known; if the attacker's refresh token still
       * works, nothing changed for them.
       */
      const session = await registerAndLogin();
      harness.resetThrottle();

      const token = await requestReset(credentials.email);
      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand@New2026' })
        .expect(200);

      harness.resetThrottle();

      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', session.refreshCookie)
        .expect(401);
    });

    it('refuses a token twice', async () => {
      await registerAndLogin();
      harness.resetThrottle();

      const token = await requestReset(credentials.email);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand@New2026' })
        .expect(200);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Another@Pass1' })
        .expect(400);
    });

    it('refuses an expired token', async () => {
      await registerAndLogin();
      harness.resetThrottle();

      const token = await requestReset(credentials.email);

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { email: credentials.email.toLowerCase() },
      });
      await harness.prisma.passwordReset.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand@New2026' })
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/expired/i);
    });

    it('invalidates an earlier link when a new one is requested', async () => {
      // A forwarded or shoulder-surfed older link must stop working.
      await registerAndLogin();
      harness.resetThrottle();

      const first = await requestReset(credentials.email);
      await requestReset(credentials.email);

      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: first, password: 'Brand@New2026' })
        .expect(400);
    });

    it('applies the same password policy as signup', async () => {
      await registerAndLogin();
      harness.resetThrottle();

      const token = await requestReset(credentials.email);

      const response = await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'weak' })
        .expect(400);

      expect(JSON.stringify(response.body)).toMatch(/requirement|character/i);
    });

    it('verifies the address, since holding the link proves the inbox', async () => {
      await request(server)
        .post('/api/v1/auth/signup')
        .send(credentials)
        .expect(202);
      harness.resetThrottle();

      const token = await requestReset(credentials.email);
      await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand@New2026' })
        .expect(200);

      harness.resetThrottle();

      // Never verified by link, yet login works — controlling the inbox is
      // the same proof, so demanding it twice would be theatre.
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: credentials.email, password: 'Brand@New2026' })
        .expect(200);
    });
  });
});
