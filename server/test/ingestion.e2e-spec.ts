import request from 'supertest';
import type { Server } from 'node:http';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHarness, type Harness } from './app-harness';

/**
 * Phase 5 acceptance: receipt scanning and recurrence detection.
 *
 * Runs with LLM_DRIVER=fake and QUEUE_DRIVER=inline, so the full ingestion
 * path - upload, store, enqueue, parse, stage in the review queue - executes
 * end to end without a network call, an API key, or a Redis worker whose
 * timing would make the suite flaky.
 */
describe('Ingestion (e2e)', () => {
  let harness: Harness;
  let server: Server;
  const storageRoot = join(process.cwd(), 'storage-test');

  beforeAll(async () => {
    process.env.LLM_DRIVER = 'fake';
    process.env.QUEUE_DRIVER = 'inline';
    process.env.STORAGE_ROOT = storageRoot;
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
          name: 'Utilities',
          monogram: 'UT',
          tint: '#FBEEDA',
          isSystem: true,
          sortOrder: 1,
        },
      ],
    });
  });

  afterAll(async () => {
    await harness.close();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.LLM_DRIVER;
    delete process.env.QUEUE_DRIVER;
    delete process.env.STORAGE_ROOT;
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

  /** A minimal but genuine JPEG header, so the type check is real. */
  const jpeg = (seed = 1): Buffer =>
    Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(512 + seed, seed),
    ]);

  describe('receipt upload', () => {
    it('stores the file and stages candidates in the review queue', async () => {
      const { token, profileId } = await setup();

      const res = await request(server)
        .post(`/api/v1/profiles/${profileId}/receipts`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', jpeg(), {
          filename: 'bill.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      expect(res.body.mimeType).toBe('image/jpeg');
      expect(res.body.sizeBytes).toBeGreaterThan(0);

      // Inline driver, so parsing has already run by the time upload returns.
      const receipt = await harness.prisma.receipt.findUniqueOrThrow({
        where: { id: res.body.id as string },
      });
      expect(receipt.status).toBe('PARSED');

      // Candidates land in the review queue, not the ledger - the same rule
      // that governs spoken input.
      const items = await harness.prisma.reviewQueueItem.findMany({
        where: { profileId },
      });
      expect(items.length).toBeGreaterThan(0);
      expect(items[0]?.source).toBe('RECEIPT');

      expect(
        await harness.prisma.transaction.count({ where: { profileId } }),
      ).toBe(0);
    });

    it('reports the review items it produced', async () => {
      const { token, profileId } = await setup();

      const uploaded = await request(server)
        .post(`/api/v1/profiles/${profileId}/receipts`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', jpeg(), {
          filename: 'bill.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/receipts/${uploaded.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.receipt.status).toBe('PARSED');
      expect(res.body.reviewItemIds.length).toBeGreaterThan(0);
    });

    it('accepts a PDF', async () => {
      // Gemini reads PDF natively - design 6b promises "PDF, JPG".
      const { token, profileId } = await setup();

      await request(server)
        .post(`/api/v1/profiles/${profileId}/receipts`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('%PDF-1.4\n...'), {
          filename: 'bill.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
    });

    it('rejects a file type it cannot read', async () => {
      const { token, profileId } = await setup();

      await request(server)
        .post(`/api/v1/profiles/${profileId}/receipts`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('MZ\x90\x00'), {
          filename: 'payload.exe',
          contentType: 'application/x-msdownload',
        })
        .expect(415);
    });

    it('rejects an empty file', async () => {
      const { token, profileId } = await setup();

      await request(server)
        .post(`/api/v1/profiles/${profileId}/receipts`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.alloc(0), {
          filename: 'empty.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);
    });

    it('requires a file', async () => {
      const { token, profileId } = await setup();

      await request(server)
        .post(`/api/v1/profiles/${profileId}/receipts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('ignores the same bill uploaded twice', async () => {
      // Matched on content, so a retried upload or a renamed file does not
      // become two review items to confirm.
      const { token, profileId } = await setup();
      const file = jpeg(7);

      const first = await request(server)
        .post(`/api/v1/profiles/${profileId}/receipts`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', file, {
          filename: 'bill.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      const second = await request(server)
        .post(`/api/v1/profiles/${profileId}/receipts`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', file, {
          filename: 'renamed.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(await harness.prisma.receipt.count({ where: { profileId } })).toBe(
        1,
      );
    });

    it('404s on another profile`s receipt', async () => {
      const aarav = await setup('aarav@example.com');
      const meera = await setup('meera@example.com');

      const uploaded = await request(server)
        .post(`/api/v1/profiles/${aarav.profileId}/receipts`)
        .set('Authorization', `Bearer ${aarav.token}`)
        .attach('file', jpeg(), {
          filename: 'bill.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      await request(server)
        .get(`/api/v1/profiles/${meera.profileId}/receipts/${uploaded.body.id}`)
        .set('Authorization', `Bearer ${meera.token}`)
        .expect(404);
    });
  });

  describe('recurrence detection', () => {
    async function seedMonthly(
      profileId: string,
      merchantName: string,
      amounts: number[],
    ) {
      const merchant = await harness.prisma.merchant.create({
        data: {
          profileId,
          normalizedName: merchantName,
          seenCount: amounts.length,
        },
      });
      const category = await harness.prisma.category.findFirstOrThrow({
        where: { name: 'Utilities' },
      });

      const start = new Date();
      start.setUTCMonth(start.getUTCMonth() - amounts.length);

      for (const [index, amount] of amounts.entries()) {
        await harness.prisma.transaction.create({
          data: {
            profileId,
            merchantId: merchant.id,
            categoryId: category.id,
            amountMinor: BigInt(amount * 100),
            direction: 'DEBIT',
            date: new Date(start.getTime() + index * 30 * 86_400_000),
          },
        });
      }

      return merchant;
    }

    it('finds a monthly bill whose amount varies', async () => {
      // Design 2e: "Adani Electricity · Utilities · recurring".
      const { token, profileId } = await setup();
      await seedMonthly(
        profileId,
        'Adani Electricity',
        [2410, 1890, 3120, 2650, 2010],
      );

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].cadence).toBe('MONTHLY');
      expect(res.body[0].merchantName).toBe('Adani Electricity');
      expect(res.body[0].amountVariancePercent).toBeGreaterThan(10);
      expect(res.body[0].alreadyConfirmed).toBe(false);
    });

    it('does not create rules on its own', async () => {
      // A pattern that silently started generating transactions would put
      // rows in the ledger the user never entered.
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(
        await harness.prisma.recurringRule.count({ where: { profileId } }),
      ).toBe(0);
    });

    it('confirms a detection into a rule', async () => {
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rule = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature, autoDebit: true })
        .expect(201);

      expect(rule.body.cadence).toBe('MONTHLY');
      expect(rule.body.amountMinor).toBe(649_00);
      expect(rule.body.autoDebit).toBe(true);
      expect(rule.body.confirmed).toBe(true);
    });

    it('re-derives the rule from history rather than trusting the request', async () => {
      // The request names which pattern to accept and nothing else, so a
      // caller cannot invent a rule that was never in the data.
      const { token, profileId } = await setup();

      await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: 'merchant:made-up' })
        .expect(404);
    });

    it('marks a confirmed detection so it is not offered again', async () => {
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      const again = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(again.body[0].alreadyConfirmed).toBe(true);

      // And confirming twice is refused.
      await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(400);
    });

    it('surfaces a due recurring payment on the dashboard', async () => {
      // Design 2a's "Needs your eye" strip is about money about to leave. A
      // subscription renewing tomorrow qualifies as much as a card statement,
      // and a profile whose only commitments are subscriptions previously saw
      // an empty panel while money was in fact about to go.
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      const dashboard = await request(server)
        .get(`/api/v1/profiles/${profileId}/dashboard`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const dues = dashboard.body.upcomingDues as {
        kind: string;
        name: string;
      }[];
      const recurring = dues.find((due) => due.kind === 'RECURRING');

      expect(recurring).toBeDefined();
      expect(recurring?.name).toBe('Netflix');
    });

    it('labels history at the moment the rule is accepted', async () => {
      // Requiring a second call to make design 2e's pill true invites it
      // being forgotten.
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rule = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      const labelled = await harness.prisma.transaction.count({
        where: { profileId, recurringRuleId: rule.body.id as string },
      });
      expect(labelled).toBe(4);

      // And the transaction list carries the rule, so the pill can render.
      const listed = await request(server)
        .get(`/api/v1/profiles/${profileId}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const items = listed.body.items as { recurringRule: unknown }[];
      expect(items[0]?.recurringRule).not.toBeNull();
    });

    it('re-labels transactions that arrive after the rule exists', async () => {
      // Confirming already labels the history, so this endpoint's remaining
      // job is catching up on payments that landed since - it is a backfill,
      // not the primary path.
      const { token, profileId } = await setup();
      const merchant = await seedMonthly(
        profileId,
        'Netflix',
        [649, 649, 649, 649],
      );

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rule = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      // Nothing left to do immediately after confirming.
      const noop = await request(server)
        .post(
          `/api/v1/profiles/${profileId}/recurring/${rule.body.id}/label-transactions`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(noop.body.labelled).toBe(0);

      // A new payment from the same merchant arrives.
      await harness.prisma.transaction.create({
        data: {
          profileId,
          merchantId: merchant.id,
          amountMinor: 649_00n,
          direction: 'DEBIT',
          date: new Date(),
        },
      });

      const backfill = await request(server)
        .post(
          `/api/v1/profiles/${profileId}/recurring/${rule.body.id}/label-transactions`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(backfill.body.labelled).toBe(1);
    });

    it('disables a rule without deleting its history', async () => {
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rule = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      await request(server)
        .patch(`/api/v1/profiles/${profileId}/recurring/${rule.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: false })
        .expect(200);

      const listed = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listed.body).toHaveLength(0);
      expect(
        await harness.prisma.transaction.count({ where: { profileId } }),
      ).toBe(4);
    });

    it('finds nothing in irregular spending', async () => {
      const { token, profileId } = await setup();
      const merchant = await harness.prisma.merchant.create({
        data: { profileId, normalizedName: 'Swiggy', seenCount: 5 },
      });

      for (const offsetDays of [0, 3, 22, 24, 65]) {
        await harness.prisma.transaction.create({
          data: {
            profileId,
            merchantId: merchant.id,
            amountMinor: 48_200n,
            direction: 'DEBIT',
            date: new Date(Date.now() - offsetDays * 86_400_000),
          },
        });
      }

      const res = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('stages a due rule in the review queue, never the ledger', async () => {
      // A confirmed rule is the user's own instruction for the *schedule*,
      // but the amount is a prediction - design 2e's own example varies
      // between ₹1,890 and ₹3,120, and writing a predicted figure into the
      // ledger would silently corrupt every downstream total.
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const rule = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      // Bring the rule due.
      await harness.prisma.recurringRule.update({
        where: { id: rule.body.id as string },
        data: { nextDueDate: new Date(Date.now() - 86_400_000) },
      });

      const before = await harness.prisma.transaction.count({
        where: { profileId },
      });

      const run = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/generate-due`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(run.body.generated).toBe(1);

      // Nothing reached the ledger.
      expect(
        await harness.prisma.transaction.count({ where: { profileId } }),
      ).toBe(before);

      const staged = await harness.prisma.reviewQueueItem.findFirstOrThrow({
        where: { profileId, source: 'RECURRING' },
      });
      expect(Number(staged.parsedAmountMinor)).toBe(649_00);
      expect(staged.parsedMerchant).toBe('Netflix');
      // Fully pre-filled, so confirming is one tap.
      expect(staged.missingFields).toEqual([]);
    });

    it('cannot double-generate for the same due date', async () => {
      // A scheduler firing twice, or a retried job, must not quietly double
      // someone's recorded spending.
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const rule = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      const dueDate = new Date(Date.now() - 86_400_000);
      await harness.prisma.recurringRule.update({
        where: { id: rule.body.id as string },
        data: { nextDueDate: dueDate },
      });

      await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/generate-due`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      // Wind it back to the same date and run again.
      await harness.prisma.recurringRule.update({
        where: { id: rule.body.id as string },
        data: { nextDueDate: dueDate },
      });

      const second = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/generate-due`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(second.body.generated).toBe(0);
      expect(second.body.skipped).toBe(1);
      expect(
        await harness.prisma.reviewQueueItem.count({
          where: { profileId, source: 'RECURRING' },
        }),
      ).toBe(1);
    });

    it('advances the schedule so a rule is not due forever', async () => {
      const { token, profileId } = await setup();
      await seedMonthly(profileId, 'Netflix', [649, 649, 649, 649]);

      const detected = await request(server)
        .get(`/api/v1/profiles/${profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const rule = await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring`)
        .set('Authorization', `Bearer ${token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      await harness.prisma.recurringRule.update({
        where: { id: rule.body.id as string },
        data: { nextDueDate: new Date('2026-01-31T00:00:00.000Z') },
      });

      await request(server)
        .post(`/api/v1/profiles/${profileId}/recurring/generate-due`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const after = await harness.prisma.recurringRule.findUniqueOrThrow({
        where: { id: rule.body.id as string },
      });
      // Calendar month, clamped: 31 Jan → 28 Feb.
      expect(after.nextDueDate?.toISOString().slice(0, 10)).toBe('2026-02-28');
    });

    it('404s on another profile`s rule', async () => {
      const aarav = await setup('aarav@example.com');
      const meera = await setup('meera@example.com');

      await seedMonthly(aarav.profileId, 'Netflix', [649, 649, 649, 649]);
      const detected = await request(server)
        .get(`/api/v1/profiles/${aarav.profileId}/recurring/detected`)
        .set('Authorization', `Bearer ${aarav.token}`)
        .expect(200);
      const rule = await request(server)
        .post(`/api/v1/profiles/${aarav.profileId}/recurring`)
        .set('Authorization', `Bearer ${aarav.token}`)
        .send({ signature: detected.body[0].signature })
        .expect(201);

      await request(server)
        .patch(`/api/v1/profiles/${meera.profileId}/recurring/${rule.body.id}`)
        .set('Authorization', `Bearer ${meera.token}`)
        .send({ enabled: false })
        .expect(404);
    });
  });

  describe('confirming moves the account balance', () => {
    it('is the path nearly every expense actually takes', async () => {
      const { token, profileId } = await setup();

      const bank = await harness.prisma.account.create({
        data: {
          profileId,
          type: 'BANK',
          name: 'BOB',
          balanceMinor: 28_000_00n,
        },
      });

      const parsed = await request(server)
        .post(`/api/v1/profiles/${profileId}/nlu/parse`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '300 rupees on groceries' })
        .expect(201);

      const itemId = parsed.body.candidates[0].reviewItemId as string;

      // Confirm takes no body; the account is chosen by editing the entry
      // first, which is also what records it as a correction.
      await request(server)
        .patch(`/api/v1/profiles/${profileId}/review-queue/${itemId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ accountId: bank.id })
        .expect(200);

      const confirmed = await request(server)
        .post(`/api/v1/profiles/${profileId}/review-queue/${itemId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      /*
       * The confirm path writes its own transaction row rather than calling
       * the transactions service, so it did not inherit the balance effect —
       * a confirmed expense appeared in the ledger while the account it came
       * from never moved.
       */
      expect(
        (
          await harness.prisma.account.findUniqueOrThrow({
            where: { id: bank.id },
          })
        ).balanceMinor,
      ).toBe(27_700_00n);

      // And undo has to give it back.
      const token2 = confirmed.body.undo?.token as string | undefined;
      if (token2) {
        await request(server)
          .post(`/api/v1/profiles/${profileId}/review-queue/undo`)
          .set('Authorization', `Bearer ${token}`)
          .send({ token: token2 })
          .expect(204);

        expect(
          (
            await harness.prisma.account.findUniqueOrThrow({
              where: { id: bank.id },
            })
          ).balanceMinor,
        ).toBe(28_000_00n);
      }
    });
  });
});
