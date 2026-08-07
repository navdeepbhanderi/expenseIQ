import request from 'supertest';
import type { Server } from 'node:http';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 4 acceptance: natural-language entry and the review queue.
 *
 * Runs against the deterministic fake adapter (LLM_DRIVER=fake), so the whole
 * pipeline — validation, banding, staging, correction, confirmation, undo —
 * is exercised with no network call, no API key and no bill. The Gemini
 * adapter sits behind the same LlmPort interface.
 */
describe('NLU and review queue (e2e)', () => {
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
          name: 'Travel',
          monogram: 'TR',
          tint: '#EAE9F2',
          isSystem: true,
          sortOrder: 2,
        },
        {
          profileId: null,
          name: 'Fuel',
          monogram: 'FU',
          tint: '#F1EBE0',
          isSystem: true,
          sortOrder: 3,
        },
        {
          profileId: null,
          name: 'Utilities',
          monogram: 'UT',
          tint: '#FBEEDA',
          isSystem: true,
          sortOrder: 4,
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

    const token = login.body.accessToken as string;
    const profileId = user.memberships[0]!.profileId;

    const sbi = await request(server)
      .post(`/api/v1/profiles/${profileId}/accounts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'BANK', name: 'SBI Savings' })
      .expect(201);

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

    return {
      token,
      profileId,
      sbiId: sbi.body.id as string,
      hdfcId: hdfc.body.id as string,
    };
  }

  const parse = (
    token: string,
    profileId: string,
    text: string,
    inputMode = 'TEXT',
  ) =>
    request(server)
      .post(`/api/v1/profiles/${profileId}/nlu/parse`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text, inputMode });

  describe('parsing', () => {
    it('parses the design`s own Hindi example', async () => {
      const { token, profileId } = await setup();

      // Design 2b / 5c: "300 रुपये किराने पे खर्च किए"
      const res = await parse(
        token,
        profileId,
        '300 रुपये किराने पे खर्च किए',
      ).expect(201);

      expect(res.body.candidates).toHaveLength(1);
      const candidate = res.body.candidates[0];
      expect(candidate.amountMinor).toBe(30_000);
      expect(candidate.categoryName).toBe('Groceries');
      expect(res.body.detectedLanguage).toBe('hi');
    });

    it('parses code-mixed Hinglish', async () => {
      const { token, profileId } = await setup();

      // Design 3d: "petrol bharwaya 1200"
      const res = await parse(token, profileId, 'petrol bharwaya 1200').expect(
        201,
      );

      expect(res.body.candidates[0].amountMinor).toBe(1_20_000);
      expect(res.body.candidates[0].categoryName).toBe('Fuel');
      expect(res.body.detectedLanguage).toBe('hi-en');
    });

    it('turns one utterance into several candidates — design 4b', async () => {
      const { token, profileId } = await setup();

      // "Caught three things"
      const res = await parse(
        token,
        profileId,
        'groceries 300, uber 640, and bijli ka bill 2400',
      ).expect(201);

      const amounts = (res.body.candidates as { amountMinor: number }[]).map(
        (c) => c.amountMinor,
      );
      expect(amounts).toEqual([30_000, 64_000, 2_40_000]);
    });

    it('recognises an account named in the input', async () => {
      const { token, profileId } = await setup();

      // Design 2b's placeholder: "petrol 1200 hdfc card"
      const res = await parse(token, profileId, 'petrol 1200 hdfc card').expect(
        201,
      );
      expect(res.body.candidates[0].accountName).toBe('HDFC Millennia');
    });

    it('understands Indian scale words', async () => {
      const { token, profileId } = await setup();

      const res = await parse(token, profileId, 'rent 25k').expect(201);
      expect(res.body.candidates[0].amountMinor).toBe(25_000_00);
    });

    it('stages everything in the review queue and nothing in the ledger', async () => {
      // The product's central rule: nothing AI-parsed reaches the ledger
      // without explicit confirmation.
      const { token, profileId } = await setup();
      await parse(token, profileId, '300 kirane pe').expect(201);

      expect(
        await harness.prisma.transaction.count({ where: { profileId } }),
      ).toBe(0);
      expect(
        await harness.prisma.reviewQueueItem.count({ where: { profileId } }),
      ).toBe(1);
    });

    it('records telemetry for cost and routing analysis', async () => {
      const { token, profileId } = await setup();
      await parse(token, profileId, '300 kirane pe').expect(201);

      const nluRequest = await harness.prisma.nluRequest.findFirstOrThrow({
        where: { profileId },
      });
      expect(nluRequest.model).toBeTruthy();
      expect(nluRequest.latencyMs).not.toBeNull();
      expect(nluRequest.candidateCount).toBe(1);
      expect(nluRequest.rawInput).toBe('300 kirane pe');
    });
  });

  describe('confidence banding', () => {
    it('marks a complete, confident parse as one-tap confirmable', async () => {
      const { token, profileId } = await setup();
      const res = await parse(
        token,
        profileId,
        '300 kirane pe sbi savings',
      ).expect(201);

      const candidate = res.body.candidates[0];
      expect(candidate.confidenceBand).toBe('CLEAR');
      expect(candidate.missingFields).toEqual([]);
      expect(candidate.canOneTapConfirm).toBe(true);
    });

    it('blocks one-tap when a field is missing, however confident', async () => {
      const { token, profileId } = await setup();

      // No account named — design 3d's "Which account?"
      const res = await parse(token, profileId, '300 kirane pe').expect(201);

      const candidate = res.body.candidates[0];
      expect(candidate.missingFields).toContain('account');
      expect(candidate.canOneTapConfirm).toBe(false);
    });

    it('flags an entry with no amount as unconfirmable', async () => {
      const { token, profileId } = await setup();

      // Design 3d: "paid rahul back · amount not found — add it to continue"
      const res = await parse(
        token,
        profileId,
        'paid rahul back on sbi savings',
      ).expect(201);

      const candidate = res.body.candidates[0];
      expect(candidate.amountMinor).toBeNull();
      expect(candidate.missingFields).toContain('amount');
      expect(candidate.confidenceBand).toBe('NEEDS_FIELD');
    });
  });

  describe('account suggestions', () => {
    it('suggests the account usually used for that category — design 3d', async () => {
      const { token, profileId, hdfcId } = await setup();
      const fuel = await harness.prisma.category.findFirstOrThrow({
        where: { name: 'Fuel' },
      });

      // History: fuel always goes on the HDFC card.
      for (let i = 0; i < 5; i += 1) {
        await harness.prisma.transaction.create({
          data: {
            profileId,
            amountMinor: 1_20_000n,
            direction: 'DEBIT',
            date: new Date(),
            categoryId: fuel.id,
            accountId: hdfcId,
          },
        });
      }

      const res = await parse(token, profileId, 'petrol 1200').expect(201);
      const suggestions = res.body.candidates[0].suggestedAccounts as {
        id: string;
        reason: string;
      }[];

      expect(suggestions[0]?.id).toBe(hdfcId);
      expect(suggestions[0]?.reason).toContain('usually');
    });

    it('still offers accounts with no history at all', async () => {
      const { token, profileId } = await setup();
      const res = await parse(token, profileId, '300 kirane pe').expect(201);

      expect(res.body.candidates[0].suggestedAccounts.length).toBeGreaterThan(
        0,
      );
    });
  });

  describe('review queue', () => {
    it('summarises the queue as design 2b`s header does', async () => {
      const { token, profileId } = await setup();
      await parse(token, profileId, '300 kirane pe sbi savings').expect(201);
      await parse(token, profileId, 'paid rahul back').expect(201);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/review-queue/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.pending).toBe(2);
      expect(res.body.clear).toBe(1);
      expect(res.body.needsAField).toBe(1);
    });

    it('confirms into the ledger and returns an undo token', async () => {
      const { token, profileId } = await setup();
      const parsed = await parse(
        token,
        profileId,
        '300 kirane pe sbi savings',
      ).expect(201);
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      const res = await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body.transaction.amountMinor).toBe(30_000);
      expect(res.body.undo.token).toBe(res.body.transaction.id);

      const transactions = await harness.prisma.transaction.count({
        where: { profileId, deletedAt: null },
      });
      expect(transactions).toBe(1);
    });

    it('refuses to confirm an entry with no amount', async () => {
      const { token, profileId } = await setup();
      const parsed = await parse(token, profileId, 'paid rahul back').expect(
        201,
      );
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('records corrections and marks the entry EDITED, not CONFIRMED', async () => {
      // The distinction is what design 2b's "read correctly on the first try"
      // stat counts.
      const { token, profileId, hdfcId } = await setup();
      const parsed = await parse(token, profileId, '300 kirane pe').expect(201);
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      await request(server)
        .patch(`/api/v1/profiles/${profileId}/review-queue/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 35_000, accountId: hdfcId })
        .expect(200);

      const corrections = await harness.prisma.correction.findMany({
        where: { reviewItemId: itemId },
      });
      expect(corrections.map((c) => c.field).sort()).toEqual([
        'account',
        'amount',
      ]);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const item = await harness.prisma.reviewQueueItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.status).toBe('EDITED');
    });

    it('clears the missing-field flag once the user fills it in', async () => {
      const { token, profileId } = await setup();
      const parsed = await parse(token, profileId, 'paid rahul back').expect(
        201,
      );
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      const edited = await request(server)
        .patch(`/api/v1/profiles/${profileId}/review-queue/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amountMinor: 50_000 })
        .expect(200);

      expect(edited.body.missingFields).not.toContain('amount');
    });

    it('discards without touching the ledger', async () => {
      const { token, profileId } = await setup();
      const parsed = await parse(token, profileId, '300 kirane pe').expect(201);
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/discard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(
        await harness.prisma.transaction.count({ where: { profileId } }),
      ).toBe(0);
    });

    it('refuses to resolve the same entry twice', async () => {
      const { token, profileId } = await setup();
      const parsed = await parse(
        token,
        profileId,
        '300 kirane pe sbi savings',
      ).expect(201);
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('bulk confirm — design 4b`s "Add all three"', () => {
    it('confirms what it can and reports what it cannot', async () => {
      const { token, profileId } = await setup();

      const parsed = await parse(
        token,
        profileId,
        'groceries 300 sbi savings, uber 640 sbi savings, and paid rahul back',
      ).expect(201);

      const itemIds = (
        parsed.body.candidates as { reviewItemId: string }[]
      ).map((c) => c.reviewItemId);

      const res = await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({ itemIds })
        .expect(201);

      // One entry missing an amount must not stop the others landing.
      expect(res.body.confirmed.length).toBeGreaterThanOrEqual(2);
      expect(
        await harness.prisma.transaction.count({
          where: { profileId, deletedAt: null },
        }),
      ).toBe(res.body.confirmed.length);
    });
  });

  describe('undo', () => {
    it('takes back a confirmation and restores the entry to pending', async () => {
      const { token, profileId } = await setup();
      const parsed = await parse(
        token,
        profileId,
        '300 kirane pe sbi savings',
      ).expect(201);
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      const confirmed = await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/undo`)
        .set('Authorization', `Bearer ${token}`)
        .send({ token: confirmed.body.undo.token })
        .expect(204);

      expect(
        await harness.prisma.transaction.count({
          where: { profileId, deletedAt: null },
        }),
      ).toBe(0);

      const item = await harness.prisma.reviewQueueItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(item.status).toBe('PENDING');
    });

    it('enforces the 10-second window server-side', async () => {
      // A client timer alone would let a stale tab undo last week's entry.
      const { token, profileId } = await setup();
      const parsed = await parse(
        token,
        profileId,
        '300 kirane pe sbi savings',
      ).expect(201);
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      const confirmed = await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // Age the transaction past the window.
      await harness.prisma.transaction.update({
        where: { id: confirmed.body.transaction.id as string },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });

      await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/undo`)
        .set('Authorization', `Bearer ${token}`)
        .send({ token: confirmed.body.undo.token })
        .expect(400);
    });

    it('refuses to undo another profile`s transaction', async () => {
      const aarav = await setup('aarav@example.com');
      const meera = await setup('meera@example.com');

      const parsed = await parse(
        aarav.token,
        aarav.profileId,
        '300 kirane pe sbi savings',
      ).expect(201);
      const itemId = parsed.body.candidates[0].reviewItemId as string;

      const confirmed = await request(server)
        .post(
          `/api/v1/profiles/${aarav.profileId}/review-queue/${itemId}/confirm`,
        )
        .set('Authorization', `Bearer ${aarav.token}`)
        .expect(201);

      await request(server)
        .post(`/api/v1/profiles/${meera.profileId}/review-queue/undo`)
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ token: confirmed.body.undo.token })
        .expect(404);
    });
  });

  describe('accuracy stats', () => {
    it('counts first-time-right against edited — design 2b', async () => {
      const { token, profileId, hdfcId } = await setup();

      // One confirmed as parsed.
      const clean = await parse(
        token,
        profileId,
        '300 kirane pe sbi savings',
      ).expect(201);
      await request(server)
        .post(
          `/api/v1/profiles/${profileId}/review-queue/${clean.body.candidates[0].reviewItemId}/confirm`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // One corrected before confirming.
      const corrected = await parse(token, profileId, 'uber 640').expect(201);
      const itemId = corrected.body.candidates[0].reviewItemId as string;
      await request(server)
        .patch(`/api/v1/profiles/${profileId}/review-queue/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ accountId: hdfcId })
        .expect(200);
      await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/nlu/accuracy`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.correctFirstTime).toBe(1);
      expect(res.body.accuracyPercent).toBe(50);
      expect(res.body.mostCorrectedField).toBe('account');
    });

    it('reports null rather than 0% for a user who has not used it', async () => {
      const { token, profileId } = await setup();

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/nlu/accuracy`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.accuracyPercent).toBeNull();
    });
  });

  describe('access control', () => {
    it('404s when parsing into another profile', async () => {
      const aarav = await setup('aarav@example.com');
      const meera = await setup('meera@example.com');

      await request(server)
        .post(`/api/v1/profiles/${aarav.profileId}/nlu/parse`)
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ text: '300 kirane pe' })
        .expect(404);
    });

    it('rate-limits parsing far below the app-wide ceiling', async () => {
      // Each call costs real money; a runaway loop is a billing incident.
      const { token, profileId } = await setup();

      const statuses: number[] = [];
      for (let i = 0; i < 24; i += 1) {
        statuses.push((await parse(token, profileId, '300 kirane pe')).status);
      }

      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    });
  });
});
