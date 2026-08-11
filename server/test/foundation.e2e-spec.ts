import request from 'supertest';
import type { Server } from 'node:http';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 0 acceptance: the foundation actually holds.
 *
 * These assert the cross-cutting behaviour every later phase depends on -
 * if the error envelope or the DB constraints are wrong, every module built
 * on top inherits the bug.
 */
describe('Foundation (e2e)', () => {
  let harness: Harness;
  let server: Server;

  beforeAll(async () => {
    harness = await createHarness();
    server = harness.app.getHttpServer() as Server;
  });

  // Every test starts from an empty database. Without this the suite passes
  // once and then fails on re-run, because rows written by the constraint
  // tests survive - and a test suite that only works on a fresh database is
  // worse than no suite at all.
  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('health', () => {
    it('reports liveness', async () => {
      const res = await request(server).get('/api/v1/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok' });
    });

    it('reports readiness only after actually reaching the database', async () => {
      const res = await request(server).get('/api/v1/health/ready').expect(200);
      expect(res.body).toEqual({ status: 'ok', checks: { database: 'up' } });
    });
  });

  describe('correlation id', () => {
    it('is present on every response, including unmatched routes', async () => {
      const res = await request(server)
        .get('/api/v1/does-not-exist')
        .expect(404);

      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });

    it('echoes a well-formed inbound id', async () => {
      const res = await request(server)
        .get('/api/v1/health')
        .set('x-request-id', 'trace-abc-123')
        .expect(200);

      expect(res.headers['x-request-id']).toBe('trace-abc-123');
    });

    it('replaces a malformed inbound id rather than reflecting it', async () => {
      const res = await request(server)
        .get('/api/v1/health')
        .set('x-request-id', 'evil"}{<script>')
        .expect(200);

      expect(res.headers['x-request-id']).not.toContain('<script>');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('error envelope', () => {
    it('uses one consistent shape', async () => {
      const res = await request(server).get('/api/v1/nope').expect(404);

      expect(res.body).toEqual({
        statusCode: 404,
        error: expect.any(String),
        message: expect.any(String),
        requestId: expect.any(String),
      });
    });
  });

  describe('database constraints', () => {
    it('rejects a duplicate system category', async () => {
      // A composite unique on (profileId, name) does NOT constrain rows where
      // profileId IS NULL - Postgres never treats NULL as equal to NULL. The
      // partial index added in migration 2 is what actually enforces this.
      await harness.prisma.category.create({
        data: {
          profileId: null,
          name: 'UniquenessProbe',
          monogram: 'UP',
          tint: '#fff',
          isSystem: true,
        },
      });

      await expect(
        harness.prisma.category.create({
          data: {
            profileId: null,
            name: 'UniquenessProbe',
            monogram: 'UP',
            tint: '#fff',
            isSystem: true,
          },
        }),
      ).rejects.toThrow(/Unique constraint|duplicate key/i);
    });

    it('rejects a second overall budget for the same month', async () => {
      // categoryId IS NULL means "the overall budget". Two of them would make
      // "₹15,790 left of ₹80,000" depend on row ordering.
      const profile = await harness.prisma.profile.create({
        data: { name: 'Budget probe', initials: 'BP' },
      });
      const month = new Date('2026-08-01T00:00:00.000Z');

      await harness.prisma.budget.create({
        data: {
          profileId: profile.id,
          categoryId: null,
          month,
          amountMinor: 8_000_000n,
        },
      });

      await expect(
        harness.prisma.budget.create({
          data: {
            profileId: profile.id,
            categoryId: null,
            month,
            amountMinor: 9_000_000n,
          },
        }),
      ).rejects.toThrow(/Unique constraint|duplicate key/i);
    });
  });

  describe('money serialisation', () => {
    it('returns BigInt amounts as JSON numbers with no precision loss', async () => {
      const profile = await harness.prisma.profile.create({
        data: { name: 'Money probe', initials: 'MP' },
      });
      const account = await harness.prisma.account.create({
        data: {
          profileId: profile.id,
          type: 'BANK',
          name: 'SBI Savings',
          balanceMinor: 38_420_000n, // ₹3,84,200
        },
      });

      // The global BigInt.prototype.toJSON patch in main.ts is what makes this
      // work; without it JSON.stringify throws TypeError on any money field.
      const serialised = JSON.parse(JSON.stringify(account)) as {
        balanceMinor: number;
      };

      expect(serialised.balanceMinor).toBe(38_420_000);
      expect(typeof serialised.balanceMinor).toBe('number');
    });
  });
});
