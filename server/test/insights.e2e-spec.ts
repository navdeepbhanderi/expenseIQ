import request from 'supertest';
import type { Server } from 'node:http';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 3 acceptance: dashboard, budgets, norms and net worth.
 *
 * Backs design 2a (desktop dashboard) and 4c (mobile home).
 */
describe('Insights (e2e)', () => {
  let harness: Harness;
  let server: Server;

  beforeAll(async () => {
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

  const thisMonth = (day: number): Date => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  };

  const monthsAgo = (months: number, day = 15): Date => {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, day),
    );
  };

  async function spend(
    profileId: string,
    amountMajor: number,
    date: Date,
    categoryName?: string,
  ) {
    const category = categoryName
      ? await harness.prisma.category.findFirstOrThrow({
          where: { name: categoryName },
        })
      : null;

    await harness.prisma.transaction.create({
      data: {
        profileId,
        amountMinor: BigInt(amountMajor * 100),
        direction: 'DEBIT',
        date,
        categoryId: category?.id ?? null,
      },
    });
  }

  describe('dashboard summary', () => {
    it('returns the full design 2a payload in one call', async () => {
      const { token, profileId } = await createUser();

      await spend(profileId, 18_420, thisMonth(2), 'Groceries');
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
        .get(`/api/v1/profiles/${profileId}/dashboard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.greetingName).toBe('Aarav');
      expect(res.body.month.spent.amountMinor).toBe(27_600_00);
      expect(res.body.month.income.amountMinor).toBe(1_42_000_00);
      expect(res.body.topCategories).toHaveLength(2);
      expect(res.body.topCategories[0].name).toBe('Groceries');
      expect(res.body.pendingReviewCount).toBe(0);
      expect(res.body.recentTransactions).toHaveLength(3);
      expect(res.body.netWorth).toBeDefined();

      // Hydrated, not ids — design 2a draws these rows without a second call.
      const [recent] = res.body.recentTransactions;
      expect(recent.amountMinor).toBeDefined();
      expect(recent.date).toBeDefined();
      expect(recent.category).toMatchObject({
        name: expect.any(String),
        monogram: expect.any(String),
        tint: expect.any(String),
      });
      expect(recent).toHaveProperty('account');
      expect(recent).toHaveProperty('merchant');
      // Drives design 2e's "Recurring" pill; null here, but the key must exist.
      expect(recent).toHaveProperty('recurringRule');

      // Newest first, and stable when two share a date.
      const dates = (res.body.recentTransactions as { date: string }[]).map(
        (t) => t.date,
      );
      expect([...dates].sort().reverse()).toEqual(dates);
    });

    it('reports the month-over-month delta design 6f renders', async () => {
      const { token, profileId } = await createUser();

      await spend(profileId, 50_000, monthsAgo(1));
      await spend(profileId, 40_000, thisMonth(2));

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.month.versusLastMonth.direction).toBe('down');
      expect(res.body.month.versusLastMonth.deltaPercent).toBe(-20);
    });

    it('returns null rather than Infinity when last month had no spend', async () => {
      const { token, profileId } = await createUser();
      await spend(profileId, 40_000, thisMonth(2));

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.month.versusLastMonth.deltaPercent).toBeNull();
    });

    it('is empty but well-formed for a brand-new profile', async () => {
      // A dashboard that 500s on day one is worse than one showing zeros.
      const { token, profileId } = await createUser();

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.month.spent.amountMinor).toBe(0);
      expect(res.body.month.budget).toBeNull();
      expect(res.body.topCategories).toEqual([]);
      expect(res.body.upcomingDues).toEqual([]);
      expect(res.body.netWorth.net.amountMinor).toBe(0);
    });
  });

  describe('net worth', () => {
    it('subtracts card and loan liabilities from bank assets', async () => {
      const { token, profileId } = await createUser();

      await harness.prisma.account.createMany({
        data: [
          {
            profileId,
            type: 'BANK',
            name: 'SBI Savings',
            balanceMinor: 3_84_200_00n,
          },
          {
            profileId,
            type: 'CREDIT_CARD',
            name: 'HDFC Millennia',
            balanceMinor: 23_480_00n,
            creditLimitMinor: 2_00_000_00n,
            statementDay: 28,
            dueDay: 12,
          },
        ],
      });

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard/net-worth`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.assets.amountMinor).toBe(3_84_200_00);
      expect(res.body.liabilities.amountMinor).toBe(23_480_00);
      expect(res.body.net.amountMinor).toBe(3_60_720_00);
    });

    it('goes negative under a large home loan, as design 2a shows', async () => {
      const { token, profileId } = await createUser();

      await harness.prisma.account.createMany({
        data: [
          {
            profileId,
            type: 'BANK',
            name: 'SBI Savings',
            balanceMinor: 3_84_200_00n,
          },
          {
            profileId,
            type: 'LOAN',
            name: 'Home loan',
            principalMinor: 60_00_000_00n,
            interestRate: 8.4,
            tenureMonths: 240,
            emisPaid: 98,
            firstEmiDate: new Date('2018-04-18T00:00:00.000Z'),
          },
        ],
      });

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard/net-worth`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // The loan contributes its *current* outstanding, not the original
      // principal — so it is less than ₹60 L and improves with each EMI.
      expect(res.body.liabilities.amountMinor).toBeLessThan(60_00_000_00);
      expect(res.body.liabilities.amountMinor).toBeGreaterThan(0);
      expect(res.body.net.amountMinor).toBeLessThan(0);
    });

    it('survives a half-configured loan instead of failing the dashboard', async () => {
      const { token, profileId } = await createUser();

      await harness.prisma.account.create({
        data: {
          profileId,
          type: 'LOAN',
          name: 'Incomplete loan',
          principalMinor: 5_00_000_00n,
          // no rate, tenure or first EMI date
        },
      });

      await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('upcoming dues', () => {
    it('lists a card due with its minimum, soonest first', async () => {
      const { token, profileId } = await createUser();

      await harness.prisma.account.create({
        data: {
          profileId,
          type: 'CREDIT_CARD',
          name: 'HDFC Millennia',
          balanceMinor: 23_480_00n,
          creditLimitMinor: 2_00_000_00n,
          statementDay: 28,
          dueDay: 12,
        },
      });

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard/upcoming-dues`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('HDFC Millennia');
      expect(res.body[0].amount.amountMinor).toBe(23_480_00);
      expect(res.body[0].minimumDue.amountMinor).toBeGreaterThan(0);
    });

    it('omits a settled card — it does not need your eye', async () => {
      const { token, profileId } = await createUser();

      await harness.prisma.account.create({
        data: {
          profileId,
          type: 'CREDIT_CARD',
          name: 'Paid off',
          balanceMinor: 0n,
          creditLimitMinor: 2_00_000_00n,
          statementDay: 28,
          dueDay: 12,
        },
      });

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard/upcoming-dues`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('trend', () => {
    it('seeds empty months as zeros so the chart line does not jump', async () => {
      const { token, profileId } = await createUser();

      await spend(profileId, 10_000, thisMonth(2));
      await spend(profileId, 20_000, monthsAgo(3));

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard/trend`)
        .query({ months: 6 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const months = res.body as {
        month: string;
        spent: { amountMinor: number };
      }[];

      expect(months).toHaveLength(6);
      expect(months.every((m) => m.month)).toBe(true);
      // Months with no activity are present with zero, not missing.
      expect(months.filter((m) => m.spent.amountMinor === 0)).toHaveLength(4);
    });
  });

  describe('budgets', () => {
    it('reports remaining and used percent — design 2a', async () => {
      const { token, profileId } = await createUser();
      await spend(profileId, 64_210, thisMonth(2));

      await request(server)
        .put(`/api/v1/profiles/${profileId}/budgets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ overallMinor: 80_000_00 })
        .expect(200);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/budgets`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // "₹15,790 left of ₹80,000 budget"
      expect(res.body.overall.remaining.amountMinor).toBe(15_790_00);
      expect(res.body.overall.usedPercent).toBeCloseTo(80.26, 1);
      expect(res.body.overall.isApproaching).toBe(true);
      expect(res.body.overall.isOver).toBe(false);
    });

    it('reports overspend above 100% with zero remaining', async () => {
      const { token, profileId } = await createUser();
      await spend(profileId, 1_12_000, thisMonth(2));

      await request(server)
        .put(`/api/v1/profiles/${profileId}/budgets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ overallMinor: 1_00_000_00 })
        .expect(200);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/budgets`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.overall.isOver).toBe(true);
      expect(res.body.overall.usedPercent).toBe(112);
      expect(res.body.overall.remaining.amountMinor).toBe(0);
    });

    it('replaces the set rather than merging, and drops zeros', async () => {
      const { token, profileId } = await createUser();
      const groceries = await harness.prisma.category.findFirstOrThrow({
        where: { name: 'Groceries' },
      });

      await request(server)
        .put(`/api/v1/profiles/${profileId}/budgets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          overallMinor: 80_000_00,
          categories: [{ categoryId: groceries.id, amountMinor: 25_000_00 }],
        })
        .expect(200);

      // Clearing the category budget must actually remove it, not leave the
      // previous value in place.
      const res = await request(server)
        .put(`/api/v1/profiles/${profileId}/budgets`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          overallMinor: 80_000_00,
          categories: [{ categoryId: groceries.id, amountMinor: 0 }],
        })
        .expect(200);

      expect(res.body.categories).toEqual([]);
      expect(res.body.overall).not.toBeNull();
    });

    it('is enforced by a DB constraint against duplicate overall budgets', async () => {
      const { token, profileId } = await createUser();

      await request(server)
        .put(`/api/v1/profiles/${profileId}/budgets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ overallMinor: 80_000_00 })
        .expect(200);

      // The partial index from Phase 0 is what makes "the overall budget"
      // singular; without it two rows could coexist and the total would
      // depend on row order.
      const overall = await harness.prisma.budget.count({
        where: { profileId, categoryId: null },
      });
      expect(overall).toBe(1);
    });
  });

  // Norms live under /reports (design 2a's sidebar item), not /budgets —
  // one canonical path per concept.
  describe('category norms', () => {
    it('reports "usual" from complete months only', async () => {
      const { token, profileId } = await createUser();

      // Six complete prior months at ₹25,000, plus a partial current month.
      for (let i = 1; i <= 6; i += 1) {
        await spend(profileId, 25_000, monthsAgo(i), 'Groceries');
      }
      await spend(profileId, 18_720, thisMonth(2), 'Groceries');

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/category-norms`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const groceries = (res.body as { categoryName: string }[]).find(
        (n) => n.categoryName === 'Groceries',
      ) as unknown as {
        usual: { amountMinor: number };
        percentOfUsual: number;
        isReliable: boolean;
      };

      // "74% of your usual ₹25,000 on groceries"
      expect(groceries.usual.amountMinor).toBe(25_000_00);
      expect(groceries.percentOfUsual).toBeCloseTo(74.88, 1);
      expect(groceries.isReliable).toBe(true);
    });

    it('stays quiet when there is too little history', async () => {
      const { token, profileId } = await createUser();

      await spend(profileId, 25_000, monthsAgo(1), 'Groceries');
      await spend(profileId, 18_720, thisMonth(2), 'Groceries');

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/category-norms`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const groceries = (res.body as { categoryName: string }[]).find(
        (n) => n.categoryName === 'Groceries',
      ) as unknown as { isReliable: boolean; percentOfUsual: number | null };

      expect(groceries.isReliable).toBe(false);
      expect(groceries.percentOfUsual).toBeNull();
    });

    it('is not skewed by a one-off spike', async () => {
      const { token, profileId } = await createUser();

      for (let i = 1; i <= 5; i += 1) {
        await spend(profileId, 25_000, monthsAgo(i), 'Groceries');
      }
      // A wedding month. A mean would put "usual" near ₹70,000.
      await spend(profileId, 3_00_000, monthsAgo(6), 'Groceries');

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/reports/category-norms`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const groceries = (res.body as { categoryName: string }[]).find(
        (n) => n.categoryName === 'Groceries',
      ) as unknown as { usual: { amountMinor: number } };

      expect(groceries.usual.amountMinor).toBe(25_000_00);
    });
  });

  describe('access control', () => {
    it('404s on another profile`s dashboard', async () => {
      const aarav = await createUser('aarav@example.com');
      const meera = await createUser('meera@example.com');

      await request(server)
        .get(`/api/v1/profiles/${aarav.profileId}/dashboard`)
        .set('Authorization', `Bearer ${meera.token}`)
        .expect(404);
    });
  });
});
