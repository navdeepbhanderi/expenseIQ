import request from 'supertest';
import type { Server } from 'node:http';
import { ProfileRole } from '@prisma/client';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 2 acceptance: accounts, categories, merchants and transactions.
 *
 * Backs design 2d (account detail, card and loan) and 2e (transactions with
 * filters, totals, facet counts and export).
 */
describe('Money core (e2e)', () => {
  let harness: Harness;
  let server: Server;

  beforeAll(async () => {
    harness = await createHarness();
    server = harness.app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await harness.reset();
    await seedSystemCategories();
  });

  afterAll(async () => {
    await harness.close();
  });

  /** truncateAll wipes the seeded system rows, so re-create the few used here. */
  async function seedSystemCategories(): Promise<void> {
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
          name: 'Travel',
          monogram: 'TR',
          tint: '#EAE9F2',
          isSystem: true,
          sortOrder: 2,
        },
        {
          profileId: null,
          name: 'Income',
          monogram: 'IN',
          tint: '#E7F0EA',
          isSystem: true,
          isIncome: true,
          sortOrder: 3,
        },
      ],
    });
  }

  async function createUser(
    email: string,
    displayName = 'Aarav',
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

  // ─── Categories ────────────────────────────────────────────────────────────

  describe('categories', () => {
    it('lists system categories without copying them per profile', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const names = (res.body as { name: string }[]).map((c) => c.name);
      expect(names).toContain('Groceries');

      // Shared, not duplicated - one row serves every profile.
      expect(
        await harness.prisma.category.count({ where: { isSystem: true } }),
      ).toBe(4);
    });

    it('derives a monogram for a custom category', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const res = await request(server)
        .post(`/api/v1/profiles/${profileId}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tuition' })
        .expect(201);

      expect(res.body.monogram).toBe('TU');
    });

    it('refuses a name that collides with a built-in', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      // The unique constraint can't catch this: system rows live under
      // profileId NULL, outside this profile's scope.
      await request(server)
        .post(`/api/v1/profiles/${profileId}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'groceries' })
        .expect(400);
    });

    it('refuses to modify a built-in category', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const system = await harness.prisma.category.findFirstOrThrow({
        where: { isSystem: true },
      });

      await request(server)
        .patch(`/api/v1/profiles/${profileId}/categories/${system.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed' })
        .expect(403);
    });

    it('archives rather than deletes, preserving transaction history', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const category = await request(server)
        .post(`/api/v1/profiles/${profileId}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Tuition' })
        .expect(201);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 500_000,
          date: '2026-08-01',
          categoryId: category.body.id,
        })
        .expect(201);

      await request(server)
        .delete(`/api/v1/profiles/${profileId}/categories/${category.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      // The transaction keeps its category - a hard delete would have
      // rewritten history.
      const transactions = await harness.prisma.transaction.count({
        where: { profileId, categoryId: category.body.id as string },
      });
      expect(transactions).toBe(1);
    });
  });

  // ─── Accounts ──────────────────────────────────────────────────────────────

  describe('credit cards', () => {
    async function createCard(token: string, profileId: string) {
      return request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'CREDIT_CARD',
          name: 'HDFC Millennia',
          issuer: 'HDFC Bank',
          last4: '8842',
          creditLimitMinor: 2_00_000_00,
          balanceMinor: 23_480_00,
          statementDay: 28,
          dueDay: 12,
        })
        .expect(201);
    }

    it('returns the whole of design 2d`s card panel', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const card = await createCard(token, profileId);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/accounts/${card.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.card).toMatchObject({
        available: { amountMinor: 1_76_520_00, currency: 'INR' },
        outstanding: { amountMinor: 23_480_00, currency: 'INR' },
        isHighUtilization: false,
      });
      expect(Math.round(res.body.card.utilizationPercent)).toBe(12);
      expect(res.body.card.minimumDue.amountMinor).toBeGreaterThan(0);
      expect(res.body.card.cycle.dueDate).toBeDefined();
      expect(typeof res.body.card.cycle.daysUntilDue).toBe('number');
    });

    it('rejects a card missing its limit or billing days', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const res = await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'CREDIT_CARD', name: 'Incomplete card' })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining(['creditLimitMinor', 'statementDay', 'dueDay']),
      );
    });

    it('rejects a full card number, accepting only the last four', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'CREDIT_CARD',
          name: 'HDFC',
          last4: '4111111111111111',
          creditLimitMinor: 100_00,
          statementDay: 1,
          dueDay: 20,
        })
        .expect(400);
    });
  });

  describe('loans', () => {
    async function createLoan(token: string, profileId: string) {
      return request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'LOAN',
          name: 'Home loan',
          issuer: 'SBI',
          principalMinor: 60_00_000_00,
          interestRate: 8.4,
          tenureMonths: 240,
          emisPaid: 98,
          firstEmiDate: '2018-04-18',
          isFloatingRate: true,
          autoDebit: true,
        })
        .expect(201);
    }

    it('returns the amortisation position design 2d renders', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const loan = await createLoan(token, profileId);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/accounts/${loan.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const summary = res.body.loan as {
        emisPaid: number;
        emisRemaining: number;
        principalPaid: { amountMinor: number };
        outstanding: { amountMinor: number };
        interestPaid: { amountMinor: number };
        closureDate: string;
      };
      expect(summary.emisPaid).toBe(98);
      expect(summary.emisRemaining).toBe(142);

      // principal paid + outstanding must reconstruct the original exactly.
      expect(
        summary.principalPaid.amountMinor + summary.outstanding.amountMinor,
      ).toBe(60_00_000_00);

      expect(summary.closureDate.slice(0, 7)).toBe('2038-03');
      expect(summary.interestPaid.amountMinor).toBeGreaterThan(0);
    });

    it('simulates a prepayment', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const loan = await createLoan(token, profileId);

      const res = await request(server)
        .post(
          `/api/v1/profiles/${profileId}/accounts/${loan.body.id}/prepay-simulation`,
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 5_00_000_00 })
        .expect(201);

      expect(res.body.interestSaved.amountMinor).toBeGreaterThan(0);
      expect(res.body.monthsSaved).toBeGreaterThan(0);
    });

    it('refuses to prepay a card', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const card = await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'CREDIT_CARD',
          name: 'HDFC',
          creditLimitMinor: 1_00_000_00,
          statementDay: 1,
          dueDay: 20,
        })
        .expect(201);

      await request(server)
        .post(
          `/api/v1/profiles/${profileId}/accounts/${card.body.id}/prepay-simulation`,
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 1000 })
        .expect(400);
    });
  });

  describe('account access and lifecycle', () => {
    it('blocks a CHILD from linking a credit card but allows cash', async () => {
      // The spec: "Attempting to link a credit card on a CHILD profile → 403".
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

      // Cash is manual entry, which the spec does allow.
      await request(server)
        .post(`/api/v1/profiles/${owner.profileId}/accounts`)
        .set('Authorization', `Bearer ${child.token}`)
        .send({ type: 'CASH', name: 'Pocket money' })
        .expect(201);
    });

    it('404s on an account belonging to another profile', async () => {
      const aarav = await createUser('aarav@example.com');
      const meera = await createUser('meera@example.com', 'Meera');

      const account = await request(server)
        .post(`/api/v1/profiles/${aarav.profileId}/accounts`)
        .set('Authorization', `Bearer ${aarav.token}`)
        .send({ type: 'BANK', name: 'SBI Savings' })
        .expect(201);

      // Meera's own profile, but Aarav's account id - must not resolve.
      await request(server)
        .get(`/api/v1/profiles/${meera.profileId}/accounts/${account.body.id}`)
        .set('Authorization', `Bearer ${meera.token}`)
        .expect(404);
    });

    it('closes an account with history instead of deleting it', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const account = await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'BANK', name: 'SBI Savings' })
        .expect(201);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 48_200,
          date: '2026-08-05',
          accountId: account.body.id,
        })
        .expect(201);

      const res = await request(server)
        .delete(`/api/v1/profiles/${profileId}/accounts/${account.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.closed).toBe(true);

      // The transaction survives - deleting would have rewritten the month.
      expect(
        await harness.prisma.transaction.count({ where: { profileId } }),
      ).toBe(1);
    });

    it('deletes an account that was never used', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const account = await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'BANK', name: 'Opened by mistake' })
        .expect(201);

      const res = await request(server)
        .delete(`/api/v1/profiles/${profileId}/accounts/${account.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.closed).toBe(false);
      expect(await harness.prisma.account.count({ where: { profileId } })).toBe(
        0,
      );
    });
  });

  // ─── Transactions ──────────────────────────────────────────────────────────

  describe('transactions', () => {
    async function seedLedger(token: string, profileId: string) {
      const groceries = await harness.prisma.category.findFirstOrThrow({
        where: { name: 'Groceries' },
      });
      const eatingOut = await harness.prisma.category.findFirstOrThrow({
        where: { name: 'Eating out' },
      });
      const income = await harness.prisma.category.findFirstOrThrow({
        where: { name: 'Income' },
      });

      const sbi = await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'BANK', name: 'SBI Savings' })
        .expect(201);

      const rows = [
        {
          amountMinor: 48_200,
          date: '2026-08-05',
          categoryId: eatingOut.id,
          merchant: 'SWIGGY*BLR9284',
        },
        {
          amountMinor: 2_14_000,
          date: '2026-08-05',
          categoryId: groceries.id,
          merchant: 'UPI/DMART/9284718',
        },
        {
          amountMinor: 64_000,
          date: '2026-08-04',
          categoryId: eatingOut.id,
          merchant: 'Zomato',
        },
        {
          amountMinor: 1_42_000_00,
          date: '2026-08-01',
          categoryId: income.id,
          direction: 'CREDIT',
          merchant: 'Infosys',
        },
      ];

      for (const row of rows) {
        await request(server)
          .post(`/api/v1/profiles/${profileId}/transactions`)
          .set('Authorization', `Bearer ${token}`)
          .send({ ...row, accountId: sbi.body.id })
          .expect(201);
      }

      return { groceries, eatingOut, income, accountId: sbi.body.id as string };
    }

    it('returns rows, totals and facets in one call - design 2e', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      await seedLedger(token, profileId);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(4);
      expect(res.body.page.total).toBe(4);

      // Spend excludes the salary; income is separate. 48200+214000+64000.
      expect(res.body.totals.spendMinor).toBe(3_26_200);
      expect(res.body.totals.incomeMinor).toBe(1_42_000_00);

      const eatingOutFacet = (
        res.body.facets.categories as { label: string; count: number }[]
      ).find((f) => f.label === 'Eating out');
      expect(eatingOutFacet?.count).toBe(2);
    });

    it('normalises merchant names on the way in', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      await seedLedger(token, profileId);

      const merchants = await harness.prisma.merchant.findMany({
        where: { profileId },
        select: { normalizedName: true },
      });
      const names = merchants.map((m) => m.normalizedName);

      expect(names).toContain('Swiggy');
      expect(names).toContain('Dmart');
    });

    it('counts a repeat merchant rather than duplicating it', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      await seedLedger(token, profileId);

      // A different branch code must map to the same merchant - that is what
      // makes the table usable as a normalisation cache.
      await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 30_000,
          date: '2026-08-06',
          merchant: 'SWIGGY*MUM1122',
        })
        .expect(201);

      const swiggy = await harness.prisma.merchant.findFirstOrThrow({
        where: { profileId, normalizedName: 'Swiggy' },
      });
      expect(swiggy.seenCount).toBe(2);
      expect(swiggy.rawAliases).toHaveLength(2);
    });

    it('keeps facet counts useful when a filter is applied', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const { groceries } = await seedLedger(token, profileId);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .query({ categoryIds: groceries.id })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);

      // The category facets must still show what picking Eating out instead
      // would yield - otherwise every other filter reads "0" and the sidebar
      // becomes useless the moment you use it.
      const eatingOut = (
        res.body.facets.categories as { label: string; count: number }[]
      ).find((f) => f.label === 'Eating out');
      expect(eatingOut?.count).toBe(2);
    });

    it('filters by date range inclusive of the final day', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      await seedLedger(token, profileId);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .query({ from: '2026-08-04', to: '2026-08-05' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // "Aug 4 – Aug 5" means through the end of the 5th, not midnight.
      expect(res.body.page.total).toBe(3);
    });

    it('searches merchant and note', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      await seedLedger(token, profileId);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .query({ q: 'swig' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.page.total).toBe(1);
    });

    it('paginates with a stable cursor', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      await seedLedger(token, profileId);

      const first = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .query({ limit: 2 })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(first.body.items).toHaveLength(2);
      expect(first.body.page.hasMore).toBe(true);

      const second = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .query({ limit: 2, cursor: first.body.page.nextCursor })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const firstIds = (first.body.items as { id: string }[]).map((t) => t.id);
      const secondIds = (second.body.items as { id: string }[]).map(
        (t) => t.id,
      );
      // No row appears on both pages.
      expect(firstIds.filter((id) => secondIds.includes(id))).toHaveLength(0);
    });

    it('restarts from page one on a corrupt cursor rather than erroring', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      await seedLedger(token, profileId);

      await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .query({ limit: 2, cursor: 'not-a-real-cursor' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('soft-deletes and restores', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 30_000, date: '2026-08-05' })
        .expect(201);

      await request(server)
        .delete(`/api/v1/profiles/${profileId}/transactions/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      // The row is still there - that is what makes the design's 10-second
      // undo possible.
      await request(server)
        .post(
          `/api/v1/profiles/${profileId}/transactions/${created.body.id}/restore`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('stores amounts as positive magnitudes with a direction', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const res = await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 30_000, direction: 'CREDIT', date: '2026-08-05' })
        .expect(201);

      expect(res.body.amountMinor).toBe(30_000);
      expect(res.body.direction).toBe('CREDIT');
    });
  });

  describe('CSV export', () => {
    it('exports the current filter', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 2_14_000,
          date: '2026-08-05',
          merchant: 'DMart',
          note: 'weekly shop',
        })
        .expect(201);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions/export`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Date,Merchant,Category,Account,Source');
      expect(res.text).toContain('Dmart');
      // Rupees, not paise - a spreadsheet would read paise as 100× too large.
      expect(res.text).toContain('2140.00');
    });

    it('neutralises a formula so the export cannot execute in a spreadsheet', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      // Merchant and note are user input, and from Phase 4 will come from
      // parsed emails too - an exported ledger is a real CSV-injection vector.
      await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 1000,
          date: '2026-08-05',
          note: '=HYPERLINK("http://evil.test","click")',
        })
        .expect(201);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions/export`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.text).not.toMatch(/,=HYPERLINK/);
      expect(res.text).toContain("'=HYPERLINK");
    });

    it('quotes cells containing commas and quotes', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amountMinor: 1000,
          date: '2026-08-05',
          note: 'Dinner, drinks and "extras"',
        })
        .expect(201);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions/export`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.text).toContain('"Dinner, drinks and ""extras"""');
    });
  });

  describe('paying a card', () => {
    it('does not count the payment as spending', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const savings = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'BANK',
          name: 'SBI Savings',
          balanceMinor: 50_000_00n,
        },
      });
      const card = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'CREDIT_CARD',
          name: 'HDFC Millennia',
          balanceMinor: 5_200_00n,
          creditLimitMinor: 2_00_000_00n,
          statementDay: 15,
          dueDay: 5,
        },
      });

      await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts/${card.id}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fromAccountId: savings.id, amountMinor: 5_200_00 })
        .expect(201);

      /*
       * The whole point. The ₹5,200 was already recorded as spending when the
       * card was swiped; if the payment counted too, the month's total, every
       * budget and every norm would jump by the same amount each time a bill
       * was paid.
       */
      const dashboard = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(dashboard.body.month.spent.amountMinor).toBe(0);

      // But the money really moved, and the card really came down.
      const [after, cardAfter] = await Promise.all([
        harness.prisma.account.findUniqueOrThrow({ where: { id: savings.id } }),
        harness.prisma.account.findUniqueOrThrow({ where: { id: card.id } }),
      ]);
      expect(after.balanceMinor).toBe(44_800_00n);
      expect(cardAfter.balanceMinor).toBe(0n);
    });

    it('writes both halves or neither', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const card = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'CREDIT_CARD',
          name: 'Card',
          balanceMinor: 1_000_00n,
        },
      });

      // A debit with no matching credit would overstate spending and
      // understate what is owed, so the pair is written in one transaction.
      await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts/${card.id}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fromAccountId: card.id, amountMinor: 100 })
        .expect(400);

      expect(
        await harness.prisma.transaction.count({ where: { profileId } }),
      ).toBe(0);
    });

    it('refuses to pay down something that is not owed', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const a = await harness.prisma.account.create({
        data: { profileId, type: 'BANK', name: 'A', balanceMinor: 100n },
      });
      const b = await harness.prisma.account.create({
        data: { profileId, type: 'BANK', name: 'B', balanceMinor: 100n },
      });

      await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts/${b.id}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fromAccountId: a.id, amountMinor: 50 })
        .expect(400);
    });
  });

  describe('balances follow the ledger', () => {
    it('spending on a card raises what is owed', async () => {
      const { token, profileId } = await createUser('aarav@example.com');

      const card = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'CREDIT_CARD',
          name: 'Flipkart Axis',
          balanceMinor: 0n,
          creditLimitMinor: 28_000_00n,
        },
      });

      for (const _ of [1, 2]) {
        await request(server)
          .post(`/api/v1/profiles/${profileId}/transactions`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            amountMinor: 5_000_00,
            date: '2026-08-11',
            accountId: card.id,
            merchant: 'Flipkart',
          })
          .expect(201);
      }

      /*
       * The reported bug. Both rows appeared in the ledger while the card
       * still read ₹0 outstanding and "0% of limit used", because nothing
       * ever moved the balance.
       */
      const after = await harness.prisma.account.findUniqueOrThrow({
        where: { id: card.id },
      });
      expect(after.balanceMinor).toBe(10_000_00n);
    });

    it('spending from a bank lowers what is held', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const bank = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'BANK',
          name: 'BOB',
          balanceMinor: 24_405_00n,
        },
      });

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 405_00, date: '2026-08-11', accountId: bank.id })
        .expect(201);

      expect(
        (
          await harness.prisma.account.findUniqueOrThrow({
            where: { id: bank.id },
          })
        ).balanceMinor,
      ).toBe(24_000_00n);

      // Deleting has to give the money back, or the balance keeps an effect
      // whose cause is gone from the ledger.
      await request(server)
        .delete(`/api/v1/profiles/${profileId}/transactions/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(
        (
          await harness.prisma.account.findUniqueOrThrow({
            where: { id: bank.id },
          })
        ).balanceMinor,
      ).toBe(24_405_00n);
    });

    it('an edit reverses the old effect before applying the new one', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const card = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'CREDIT_CARD',
          name: 'Card',
          balanceMinor: 0n,
        },
      });

      const created = await request(server)
        .post(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 5_000_00, date: '2026-08-11', accountId: card.id })
        .expect(201);

      await request(server)
        .patch(`/api/v1/profiles/${profileId}/transactions/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 3_000_00 })
        .expect(200);

      // Not 8,000 — the original effect is undone, not added to.
      expect(
        (
          await harness.prisma.account.findUniqueOrThrow({
            where: { id: card.id },
          })
        ).balanceMinor,
      ).toBe(3_000_00n);
    });
  });

  describe('statements — what is billed versus what is spent', () => {
    const StatementGenerator = () =>
      harness.app.get<
        import('@/modules/accounts/statement-generator.service').StatementGeneratorService
      >(
        require('@/modules/accounts/statement-generator.service')
          .StatementGeneratorService,
        { strict: false },
      );

    async function cardWithCycle(profileId: string) {
      return harness.prisma.account.create({
        data: {
          profileId,
          type: 'CREDIT_CARD',
          name: 'Flipkart Axis',
          balanceMinor: 0n,
          creditLimitMinor: 28_000_00n,
          statementDay: 15,
          dueDay: 5,
          minDuePercent: 5,
        },
      });
    }

    const spend = (
      profileId: string,
      accountId: string,
      iso: string,
      rupees: number,
    ) =>
      harness.prisma.transaction.create({
        data: {
          profileId,
          accountId,
          amountMinor: BigInt(rupees * 100),
          direction: 'DEBIT',
          date: new Date(`${iso}T00:00:00.000Z`),
          source: 'MANUAL',
        },
      });

    it('bills the cycle that ended and leaves later spending alone', async () => {
      const { profileId } = await createUser('aarav@example.com');
      const card = await cardWithCycle(profileId);

      // Inside the cycle that the 15 Aug statement covers.
      await spend(profileId, card.id, '2026-08-10', 5_000);
      // After it — belongs to the 15 Sep statement, not this one.
      await spend(profileId, card.id, '2026-08-20', 1_200);

      await StatementGenerator().run(
        profileId,
        new Date('2026-08-25T00:00:00.000Z'),
      );

      const statement = await harness.prisma.cardStatement.findFirstOrThrow({
        where: { accountId: card.id },
      });

      /*
       * The whole point of the phase. ₹5,000 was billed on 15 Aug and is due
       * 5 Sep; the ₹1,200 spent on the 20th is next month's problem. The
       * product previously had one number and could not tell them apart, so
       * "clear this bill" offered to pay for both.
       */
      expect(statement.amountMinor).toBe(5_000_00n);
      expect(statement.dueDate.toISOString().slice(0, 10)).toBe('2026-09-05');
      expect(statement.minimumDueMinor).toBe(250_00n);
      expect(statement.status).toBe('OPEN');
    });

    it('is safe to run twice', async () => {
      const { profileId } = await createUser('aarav@example.com');
      const card = await cardWithCycle(profileId);
      await spend(profileId, card.id, '2026-08-10', 5_000);

      const asOf = new Date('2026-08-25T00:00:00.000Z');
      await StatementGenerator().run(profileId, asOf);
      await StatementGenerator().run(profileId, asOf);

      // A nightly job that double-billed would be worse than one that never ran.
      expect(
        await harness.prisma.cardStatement.count({
          where: { accountId: card.id },
        }),
      ).toBe(1);
    });

    it('carries an unpaid bill into the next one', async () => {
      const { profileId } = await createUser('aarav@example.com');
      const card = await cardWithCycle(profileId);

      await spend(profileId, card.id, '2026-08-10', 5_000);
      await StatementGenerator().run(
        profileId,
        new Date('2026-08-16T00:00:00.000Z'),
      );

      await spend(profileId, card.id, '2026-09-02', 2_000);
      await StatementGenerator().run(
        profileId,
        new Date('2026-09-16T00:00:00.000Z'),
      );

      const latest = await harness.prisma.cardStatement.findFirstOrThrow({
        where: { accountId: card.id },
        orderBy: { statementDate: 'desc' },
      });

      // A bill you did not clear does not vanish when the next is cut.
      expect(latest.amountMinor).toBe(7_000_00n);
    });

    it('marks an unpaid bill overdue only once its date has passed', async () => {
      const { profileId } = await createUser('aarav@example.com');
      const card = await cardWithCycle(profileId);
      await spend(profileId, card.id, '2026-08-10', 5_000);

      await StatementGenerator().run(
        profileId,
        new Date('2026-08-16T00:00:00.000Z'),
      );
      expect(
        (
          await harness.prisma.cardStatement.findFirstOrThrow({
            where: { accountId: card.id },
          })
        ).status,
      ).toBe('OPEN');

      // Overdue means money is unpaid past the date, not that a date passed.
      await StatementGenerator().run(
        profileId,
        new Date('2026-09-06T00:00:00.000Z'),
      );
      expect(
        (
          await harness.prisma.cardStatement.findFirstOrThrow({
            where: { accountId: card.id },
          })
        ).status,
      ).toBe('OVERDUE');
    });

    it('a payment settles the bill, not just the balance', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const card = await cardWithCycle(profileId);
      const bank = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'BANK',
          name: 'BOB',
          balanceMinor: 50_000_00n,
        },
      });

      await spend(profileId, card.id, '2026-08-10', 5_000);
      await StatementGenerator().run(
        profileId,
        new Date('2026-08-16T00:00:00.000Z'),
      );

      await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts/${card.id}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fromAccountId: bank.id, amountMinor: 5_000_00 })
        .expect(201);

      const statement = await harness.prisma.cardStatement.findFirstOrThrow({
        where: { accountId: card.id },
      });
      expect(statement.paidMinor).toBe(5_000_00n);
      expect(statement.status).toBe('PAID');
    });

    it('records a part payment without closing the bill', async () => {
      const { token, profileId } = await createUser('aarav@example.com');
      const card = await cardWithCycle(profileId);
      const bank = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'BANK',
          name: 'BOB',
          balanceMinor: 50_000_00n,
        },
      });

      await spend(profileId, card.id, '2026-08-10', 5_000);
      await StatementGenerator().run(
        profileId,
        new Date('2026-08-16T00:00:00.000Z'),
      );

      // Paying the minimum is not paying the bill — that difference is free
      // credit versus interest, so it must stay visible.
      await request(server)
        .post(`/api/v1/profiles/${profileId}/accounts/${card.id}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ fromAccountId: bank.id, amountMinor: 250_00 })
        .expect(201);

      const statement = await harness.prisma.cardStatement.findFirstOrThrow({
        where: { accountId: card.id },
      });
      expect(statement.paidMinor).toBe(250_00n);
      expect(statement.status).toBe('OPEN');
    });
  });
});
