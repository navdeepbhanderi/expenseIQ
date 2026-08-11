import request from 'supertest';
import type { Server } from 'node:http';
import { createHarness, type Harness } from './app-harness';

/**
 * The endpoints the plan specced but the phase builds missed:
 * the Reports module (design 2a's sidebar item), standalone account
 * suggestions (design 2b's "Usually: …") and bulk transaction deletion.
 */
describe('Reports and gap-fill endpoints (e2e)', () => {
  let harness: Harness;
  let server: Server;

  beforeAll(async () => {
    process.env.LLM_DRIVER = 'fake';
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
          name: 'Fuel',
          monogram: 'FU',
          tint: '#F1EBE0',
          isSystem: true,
          sortOrder: 2,
        },
      ],
    });
  });

  afterAll(async () => {
    await harness.close();
    delete process.env.LLM_DRIVER;
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

  const thisMonth = (day: number): Date => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  };

  const lastMonth = (day: number): Date => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
  };

  async function spend(
    profileId: string,
    amountMajor: number,
    date: Date,
    categoryName?: string,
    merchant?: string,
  ) {
    const category = categoryName
      ? await harness.prisma.category.findFirstOrThrow({
          where: { name: categoryName },
        })
      : null;

    // Created separately: Prisma refuses to mix scalar foreign keys with a
    // nested create in the same `data` object.
    const merchantRow = merchant
      ? await harness.prisma.merchant.create({
          data: { profileId, normalizedName: merchant, seenCount: 1 },
        })
      : null;

    return harness.prisma.transaction.create({
      data: {
        profileId,
        amountMinor: BigInt(amountMajor * 100),
        direction: 'DEBIT',
        date,
        categoryId: category?.id ?? null,
        merchantId: merchantRow?.id ?? null,
      },
    });
  }

  describe('reports/summary', () => {
    it('totals a period with a per-day average and the largest spend', async () => {
      const { token, profileId } = await setup();

      await spend(profileId, 18_420, thisMonth(2), 'Groceries', 'DMart');
      await spend(profileId, 9_180, thisMonth(3), 'Eating out');
      await harness.prisma.transaction.create({
        data: {
          profileId,
          amountMinor: BigInt(1_42_000 * 100),
          direction: 'CREDIT',
          date: thisMonth(1),
        },
      });

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.spent.amountMinor).toBe(27_600_00);
      expect(res.body.income.amountMinor).toBe(1_42_000_00);
      expect(res.body.net.amountMinor).toBe(1_14_400_00);
      expect(res.body.transactionCount).toBe(3);
      expect(res.body.largestTransaction.amount.amountMinor).toBe(18_420_00);
      expect(res.body.largestTransaction.merchant).toBe('DMart');
      expect(res.body.period.kind).toBe('month');
    });

    it('divides by days elapsed, not days in the month', async () => {
      // Dividing August's spend by 31 on the 5th under-reports it six-fold.
      const { token, profileId } = await setup();
      await spend(profileId, 10_000, thisMonth(1));

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const daysSoFar = new Date().getUTCDate();
      expect(res.body.averagePerDay.amountMinor).toBe(
        Math.round(10_000_00 / daysSoFar),
      );
    });

    it('supports quarter and year', async () => {
      const { token, profileId } = await setup();
      await spend(profileId, 5_000, thisMonth(1));

      for (const period of ['quarter', 'year']) {
        const res = await request(server)
          .get(`/api/v1/profiles/${profileId}/reports/summary`)
          .query({ period })
          .set('Authorization', `Bearer ${token}`)
          .expect(200);

        expect(res.body.period.kind).toBe(period);
        expect(res.body.spent.amountMinor).toBe(5_000_00);
      }
    });

    it('rejects an unknown period', async () => {
      const { token, profileId } = await setup();

      await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/summary`)
        .query({ period: 'fortnight' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('is well-formed for a profile with no history', async () => {
      const { token, profileId } = await setup();

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.spent.amountMinor).toBe(0);
      expect(res.body.largestTransaction).toBeNull();
    });
  });

  describe('reports/comparison', () => {
    it('compares this month with the last - design 6f', async () => {
      const { token, profileId } = await setup();

      await spend(profileId, 50_000, lastMonth(10), 'Groceries');
      await spend(profileId, 40_000, thisMonth(2), 'Groceries');

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/comparison`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.spend.direction).toBe('down');
      expect(res.body.spend.deltaPercent).toBe(-20);
      expect(res.body.current.label).toBeTruthy();
      expect(res.body.previous.label).toBeTruthy();
    });

    it('includes a category that disappeared this period', async () => {
      // A subscription that stopped is the most interesting row on the
      // screen; listing only what is present this month would hide it.
      const { token, profileId } = await setup();

      await spend(profileId, 5_000, lastMonth(10), 'Fuel');
      await spend(profileId, 40_000, thisMonth(2), 'Groceries');

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/comparison`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const fuel = (
        res.body.byCategory as {
          name: string;
          direction: string;
          current: { amountMinor: number };
        }[]
      ).find((row) => row.name === 'Fuel');

      expect(fuel).toBeDefined();
      expect(fuel?.current.amountMinor).toBe(0);
      expect(fuel?.direction).toBe('down');
    });

    it('sorts by the biggest mover, not alphabetically', async () => {
      const { token, profileId } = await setup();

      await spend(profileId, 1_000, lastMonth(10), 'Eating out');
      await spend(profileId, 1_200, thisMonth(2), 'Eating out');
      await spend(profileId, 5_000, lastMonth(10), 'Groceries');
      await spend(profileId, 50_000, thisMonth(2), 'Groceries');

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/comparison`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect((res.body.byCategory as { name: string }[])[0]?.name).toBe(
        'Groceries',
      );
    });
  });

  describe('reports/category-norms', () => {
    it('lives under reports, the plan`s canonical path', async () => {
      const { token, profileId } = await setup();

      await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/category-norms`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // The duplicate under /budgets is gone - one path per concept.
      await request(server)
        .get(`/api/v1/profiles/${profileId}/budgets/norms`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('nlu/suggestions/account', () => {
    it('answers independently of a parse - design 2b`s "Usually: …"', async () => {
      const { token, profileId } = await setup();

      const hdfc = await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'CREDIT_CARD',
          name: 'HDFC Millennia',
          creditLimitMinor: 2_00_000_00,
          statementDay: 28,
          dueDay: 12,
        })
        .expect(201);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'BANK', name: 'SBI Savings' })
        .expect(201);

      const fuel = await harness.prisma.category.findFirstOrThrow({
        where: { name: 'Fuel' },
      });

      for (let i = 0; i < 5; i += 1) {
        await harness.prisma.transaction.create({
          data: {
            profileId,
            amountMinor: 1_20_000n,
            direction: 'DEBIT',
            date: new Date(),
            categoryId: fuel.id,
            accountId: hdfc.body.id as string,
          },
        });
      }

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/nlu/suggestions/account`)
        .query({ categoryId: fuel.id })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body[0].id).toBe(hdfc.body.id);
      expect(res.body[0].reason).toContain('usually');
    });

    it('works with no category, for a first-time entry', async () => {
      const { token, profileId } = await setup();

      await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'BANK', name: 'SBI Savings' })
        .expect(201);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/nlu/suggestions/account`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  describe('transactions/bulk-delete', () => {
    it('soft-deletes several at once', async () => {
      const { token, profileId } = await setup();

      const a = await spend(profileId, 1_000, thisMonth(1));
      const b = await spend(profileId, 2_000, thisMonth(2));
      await spend(profileId, 3_000, thisMonth(3));

      const res = await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions/bulk-delete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionIds: [a.id, b.id] })
        .expect(201);

      expect(res.body.deleted).toBe(2);

      const remaining = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(remaining.body.page.total).toBe(1);

      // Soft, not hard - the rows survive for restore.
      expect(
        await harness.prisma.transaction.count({ where: { profileId } }),
      ).toBe(3);
    });

    it('silently ignores ids from another profile', async () => {
      // Scoped in the same statement, so a foreign id matches nothing rather
      // than the check and the write being two steps apart.
      const aarav = await setup('aarav@example.com');
      const meera = await setup('meera@example.com');

      const theirs = await spend(aarav.profileId, 1_000, thisMonth(1));

      const res = await request(server)
        .post(`/api/v1/profiles/${meera.profileId}/transactions/bulk-delete`)
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ transactionIds: [theirs.id] })
        .expect(201);

      expect(res.body.deleted).toBe(0);

      const survivor = await harness.prisma.transaction.findUniqueOrThrow({
        where: { id: theirs.id },
      });
      expect(survivor.deletedAt).toBeNull();
    });

    it('rejects an empty list', async () => {
      const { token, profileId } = await setup();

      await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions/bulk-delete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ transactionIds: [] })
        .expect(400);
    });
  });
});
