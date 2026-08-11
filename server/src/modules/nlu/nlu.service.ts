import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ConfidenceBand,
  InputMode,
  ReviewStatus,
  TransactionSource,
  type Account,
  type Category,
} from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import {
  LLM_PORT,
  LlmError,
  type ExtractedCandidate,
  type ExtractionContext,
  type LlmPort,
  type ParseInput,
} from '@/infra/llm/llm.port';

import {
  bandFor,
  canOneTapConfirm,
  findMissingFields,
  overallConfidence,
  uncertainFields,
} from './domain/confidence';
import { suggestAccounts } from './domain/suggestions';
import { countDateExpressions, resolveDate, todayIn } from './domain/dates';
import { resolveAmount } from './domain/amounts';
import { matchAccount, matchCategory } from './domain/matching';
import { LlmResolver } from '@/modules/llm-settings/llm-resolver.service';

export interface ParsedCandidate {
  reviewItemId: string;
  amountMinor: number | null;
  direction: 'DEBIT' | 'CREDIT';
  categoryId: string | null;
  categoryName: string | null;
  merchant: string | null;
  date: string | null;
  accountId: string | null;
  accountName: string | null;
  note: string | null;
  confidence: number;
  confidenceBand: ConfidenceBand;
  missingFields: string[];
  uncertainFields: string[];
  canOneTapConfirm: boolean;
  /** Ranked account guesses — design 3d's "You usually put fuel on HDFC". */
  suggestedAccounts: { id: string; name: string; reason: string }[];
}

export interface ParseResult {
  requestId: string;
  rawInput: string;
  detectedLanguage: string | null;
  candidates: ParsedCandidate[];
}

@Injectable()
export class NluService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly resolver: LlmResolver,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('NLU');
  }

  /**
   * Parses input into candidate transactions and stages them for review.
   *
   * Synchronous, deliberately. The architecture doc puts this on a queue, but
   * design 5c and 3c show the parse result inline about a second after the
   * user stops speaking — a queue round-trip cannot deliver that. Queues are
   * for ingestion (Gmail, receipts), where nobody is waiting on screen.
   *
   * Nothing here writes to the ledger. Every candidate lands in the review
   * queue, which is the product's central trust mechanism.
   */
  async parse(
    profileId: string,
    input: ParseInput,
    inputMode: InputMode,
    rawInput: string,
    // Overridden by ingestion paths — a receipt and a spoken sentence take the
    // same route through here but must stay distinguishable in the ledger,
    // because design 2e renders the provenance pill from it.
    sourceOverride?: TransactionSource,
  ): Promise<ParseResult> {
    const context = await this.buildContext(profileId);
    const { categories, accounts } = context.lookups;

    let extraction;
    try {
      extraction = await this.callWithRetry(profileId, input, context.forLlm);
    } catch (error) {
      // Never silently drop a user's input. A failed parse still becomes a
      // review item carrying the raw text, so the user can complete it by
      // hand instead of losing what they said.
      return this.recordFailure(
        profileId,
        rawInput,
        inputMode,
        error,
        sourceOverride,
      );
    }

    const request = await this.prisma.nluRequest.create({
      data: {
        profileId,
        rawInput,
        inputMode,
        detectedLanguage: extraction.detectedLanguage,
        model: extraction.model,
        latencyMs: extraction.latencyMs,
        inputTokens: extraction.inputTokens,
        outputTokens: extraction.outputTokens,
        candidateCount: extraction.candidates.length,
      },
    });

    const source =
      sourceOverride ??
      (inputMode === InputMode.VOICE || inputMode === InputMode.AUDIO
        ? TransactionSource.NLU_VOICE
        : TransactionSource.NLU_TEXT);

    const affinity = await this.accountAffinity(profileId);
    const learnedCategory = await this.categoryByMerchant(profileId);

    const candidates: ParsedCandidate[] = [];

    /*
     * The date the user actually said, worked out here rather than trusted
     * from the model.
     *
     * Every model in the free fallback chain is small, and they fail at date
     * arithmetic in one consistent direction: they answer today. That is the
     * one wrong answer a user cannot spot, because an unstated date also
     * shows as today. Where the utterance contains a date expression we can
     * resolve, it wins over whatever came back.
     *
     * Single-candidate only. With several expenses in one sentence the date
     * words cannot be attributed to a particular clause without parsing the
     * sentence properly, and applying one date to all of them would be
     * confidently wrong rather than usefully right.
     */
    const today = todayIn(context.forLlm.timezone);

    /*
     * One date may cover several expenses; two may not.
     *
     * "kal groceries 300 aur petrol 1200" names a single day and means it for
     * both — refusing to apply it there left the common multi-expense case
     * dated today, which is the very bug this resolver exists to fix. But once
     * the sentence names two different days, attributing each to the right
     * clause needs real parsing, and applying one to all would be confidently
     * wrong rather than usefully right. So the override stops there and the
     * model keeps its answer.
     */
    const spokenDate =
      countDateExpressions(rawInput) === 1
        ? resolveDate(rawInput, today)
        : null;

    /*
     * The amount, but only when a scale word was spoken.
     *
     * Applied to a single candidate only: with several expenses in one
     * sentence there is no way to tell which "5k" belongs to, and a bare
     * number is left to the model in every case.
     */
    const spokenAmount =
      extraction.candidates.length === 1 ? resolveAmount(rawInput) : null;

    for (const raw of extraction.candidates) {
      const candidate = sanitise(raw);

      if (spokenDate && spokenDate.date !== candidate.date) {
        this.logger.debug("Overrode the model's date", {
          profileId,
          modelSaid: candidate.date,
          resolved: spokenDate.date,
          from: spokenDate.matched,
        });

        candidate.date = spokenDate.date;
        // The field's own confidence becomes the resolver's, so an ambiguous
        // "kal" still surfaces as worth a glance rather than as settled.
        candidate.fieldConfidence.date = spokenDate.confidence;
      }

      if (spokenAmount && spokenAmount.amountMinor !== candidate.amountMinor) {
        this.logger.debug("Overrode the model's amount", {
          profileId,
          modelSaid: candidate.amountMinor,
          resolved: spokenAmount.amountMinor,
          from: spokenAmount.matched,
        });

        candidate.amountMinor = spokenAmount.amountMinor;
        candidate.fieldConfidence.amount = spokenAmount.confidence;
      }

      /*
       * Fuzzy rather than exact name matching.
       *
       * The model answers with what was said — "HDFC" for "HDFC Millennia",
       * "grocery" for "Groceries", "kirana" for either. Exact equality
       * rejected all of those and asked the user to pick a value the system
       * had already understood.
       */
      let category = matchCategory(categories, candidate.category)?.row ?? null;

      /*
       * Fall back to what this profile usually does with this merchant.
       *
       * Only when the spoken category matched nothing — the user's explicit
       * word always wins over an inference from history. This is what makes
       * "blinkit 400" land in Groceries for someone who has always filed it
       * there, without anyone having to add Blinkit to a synonym table.
       */
      if (!category && candidate.merchant) {
        const learned = learnedCategory.get(candidate.merchant.toLowerCase());
        category = learned
          ? (categories.find((c) => c.id === learned) ?? null)
          : null;
      }
      const account = matchAccount(accounts, candidate.account)?.row ?? null;

      const confidence = overallConfidence(candidate);
      const band = bandFor(confidence);
      const missing = findMissingFields(candidate);

      const suggestions = suggestAccounts({
        accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
        categoryId: category?.id ?? null,
        affinity,
        exclude: account?.id ?? null,
      });

      const item = await this.prisma.reviewQueueItem.create({
        data: {
          profileId,
          nluRequestId: request.id,
          parsedAmountMinor:
            candidate.amountMinor === null
              ? null
              : BigInt(candidate.amountMinor),
          parsedDirection: candidate.direction,
          parsedCategoryId: category?.id ?? null,
          parsedMerchant: candidate.merchant,
          parsedAccountId: account?.id ?? null,
          parsedDate: candidate.date ? new Date(candidate.date) : null,
          parsedNote: candidate.note,
          confidence,
          confidenceBand: band,
          fieldConfidences: candidate.fieldConfidence,
          missingFields: missing,
          suggestedAccountIds: suggestions.map((s) => s.id),
          status: ReviewStatus.PENDING,
          source,
        },
      });

      candidates.push({
        reviewItemId: item.id,
        amountMinor: candidate.amountMinor,
        direction: candidate.direction,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        merchant: candidate.merchant,
        date: candidate.date,
        accountId: account?.id ?? null,
        accountName: account?.name ?? null,
        note: candidate.note,
        confidence,
        confidenceBand: band,
        missingFields: missing,
        uncertainFields: uncertainFields(candidate),
        canOneTapConfirm: canOneTapConfirm(band, missing),
        suggestedAccounts: suggestions,
      });
    }

    this.logger.log('Parsed natural-language input', {
      profileId,
      requestId: request.id,
      candidates: candidates.length,
      language: extraction.detectedLanguage,
      latencyMs: extraction.latencyMs,
      model: extraction.model,
    });

    return {
      requestId: request.id,
      rawInput,
      detectedLanguage: extraction.detectedLanguage,
      candidates,
    };
  }

  /** Design 5b/3b: partial readings while the user is still speaking. */
  async *stream(
    profileId: string,
    input: ParseInput,
  ): AsyncIterable<{
    transcript: string;
    detectedLanguage: string | null;
    preview: {
      amountMinor: number | null;
      category: string | null;
      date: string | null;
    };
  }> {
    const context = await this.buildContext(profileId);
    yield* this.llm.extractStream(input, context.forLlm);
  }

  /**
   * One retry, with the failure fed back into the attempt.
   *
   * Only for retryable failures — a rate limit or a truncated response is
   * worth a second try, an invalid API key is not, and retrying it just
   * doubles the latency before the user sees the same error.
   */
  private async callWithRetry(
    profileId: string,
    input: ParseInput,
    context: ExtractionContext,
  ) {
    // Through the resolver, so a profile with its own provider key uses it —
    // and falls back to the platform if that key has stopped working.
    const call = () => this.resolver.extract(profileId, input, context);

    try {
      return await call();
    } catch (error) {
      if (error instanceof LlmError && error.retryable) {
        this.logger.warn('Retrying extraction after a retryable failure', {
          reason: error.message,
        });
        return await call();
      }
      throw error;
    }
  }

  /**
   * A failed parse still produces a review item.
   *
   * The spec's hard rule: never silently drop a user's input. The raw text is
   * preserved with null confidence, so it appears in the queue as something
   * to complete by hand rather than vanishing.
   */
  private async recordFailure(
    profileId: string,
    rawInput: string,
    inputMode: InputMode,
    error: unknown,
    sourceOverride?: TransactionSource,
  ): Promise<ParseResult> {
    const reason = error instanceof Error ? error.message : String(error);

    this.logger.error('Extraction failed, preserving raw input', undefined, {
      profileId,
      reason,
    });

    const request = await this.prisma.nluRequest.create({
      data: {
        profileId,
        rawInput,
        inputMode,
        failed: true,
        errorReason: reason,
        candidateCount: 1,
      },
    });

    const item = await this.prisma.reviewQueueItem.create({
      data: {
        profileId,
        nluRequestId: request.id,
        confidence: null,
        confidenceBand: ConfidenceBand.NEEDS_FIELD,
        missingFields: ['amount', 'category', 'account', 'date'],
        status: ReviewStatus.PENDING,
        source: sourceOverride ?? TransactionSource.NLU_TEXT,
      },
    });

    // 503 only when the model is entirely unconfigured — otherwise the entry
    // is safely staged and the user should see it, not an error page.
    if (error instanceof LlmError && !error.retryable && !this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Natural-language entry is not configured on this server',
      );
    }

    return {
      requestId: request.id,
      rawInput,
      detectedLanguage: null,
      candidates: [
        {
          reviewItemId: item.id,
          amountMinor: null,
          direction: 'DEBIT',
          categoryId: null,
          categoryName: null,
          merchant: null,
          date: null,
          accountId: null,
          accountName: null,
          note: null,
          confidence: 0,
          confidenceBand: ConfidenceBand.NEEDS_FIELD,
          missingFields: ['amount', 'category', 'account', 'date'],
          uncertainFields: [],
          canOneTapConfirm: false,
          suggestedAccounts: [],
        },
      ],
    };
  }

  private isConfigured(): boolean {
    return this.llm.name !== 'gemini' || Boolean(process.env.GEMINI_API_KEY);
  }

  private async buildContext(profileId: string): Promise<{
    forLlm: ExtractionContext;
    lookups: { categories: Category[]; accounts: Account[] };
  }> {
    const [categories, accounts, merchants, profile] = await Promise.all([
      this.prisma.category.findMany({
        where: { OR: [{ profileId: null }, { profileId }], archivedAt: null },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.account.findMany({
        where: { profileId, closedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.merchant.findMany({
        where: { OR: [{ profileId }, { profileId: null }] },
        orderBy: { seenCount: 'desc' },
        take: 40,
        select: { normalizedName: true },
      }),
      this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { locale: true },
      }),
    ]);

    return {
      forLlm: {
        categories: categories.map((c) => c.name),
        accounts: accounts.map((a) => a.name),
        knownMerchants: merchants.map((m) => m.normalizedName),
        today: new Date(),
        // India-first product; the profile's locale will drive this once
        // multi-region matters.
        timezone: profile?.locale === 'en-IN' ? 'Asia/Kolkata' : 'Asia/Kolkata',
      },
      lookups: { categories, accounts },
    };
  }

  /** categoryId → accountId → how often that pairing was used. */
  /**
   * The category this profile actually files each merchant under.
   *
   * The synonym table in matching.ts is a fixed guess at what people call
   * things; this is what *this* user demonstrably does. If every Blinkit
   * charge has been filed to Groceries, then Blinkit means Groceries here —
   * whatever the table says, and whether or not the model offered a category
   * at all.
   *
   * Built from confirmed transactions rather than from Correction rows: a
   * correction records that a field changed but not the word that was spoken,
   * so it cannot say what the user *meant*. The settled ledger can.
   */
  private async categoryByMerchant(
    profileId: string,
  ): Promise<Map<string, string>> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['merchantId', 'categoryId'],
      where: {
        profileId,
        deletedAt: null,
        merchantId: { not: null },
        categoryId: { not: null },
      },
      _count: { _all: true },
    });

    // Most-used category per merchant; ties go to whichever is seen first,
    // which is stable enough for a suggestion the user still confirms.
    const best = new Map<string, { categoryId: string; count: number }>();

    for (const row of rows) {
      if (!row.merchantId || !row.categoryId) continue;
      const current = best.get(row.merchantId);
      if (!current || row._count._all > current.count) {
        best.set(row.merchantId, {
          categoryId: row.categoryId,
          count: row._count._all,
        });
      }
    }

    const merchants = await this.prisma.merchant.findMany({
      where: { id: { in: [...best.keys()] } },
      select: { id: true, normalizedName: true },
    });

    return new Map(
      merchants.map((m) => [
        m.normalizedName.toLowerCase(),
        best.get(m.id)!.categoryId,
      ]),
    );
  }

  private async accountAffinity(
    profileId: string,
  ): Promise<Map<string, Map<string, number>>> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId', 'accountId'],
      where: {
        profileId,
        deletedAt: null,
        categoryId: { not: null },
        accountId: { not: null },
      },
      _count: { _all: true },
    });

    const affinity = new Map<string, Map<string, number>>();

    for (const row of rows) {
      if (!row.categoryId || !row.accountId) continue;
      const forCategory =
        affinity.get(row.categoryId) ?? new Map<string, number>();
      forCategory.set(row.accountId, row._count._all);
      affinity.set(row.categoryId, forCategory);
    }

    return affinity;
  }

  /**
   * Ranked account guesses for a category, independent of a parse.
   *
   * Design 2b shows "Usually: SBI Savings, Cash, HDFC Millennia" when the
   * user taps the account field on an entry that never named one — that is a
   * fresh question, not something the original parse response can answer,
   * because the user may have just changed the category.
   */
  async suggestAccountsFor(
    profileId: string,
    categoryId: string | null,
  ): Promise<{ id: string; name: string; reason: string }[]> {
    const [accounts, affinity] = await Promise.all([
      this.prisma.account.findMany({
        where: { profileId, closedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.accountAffinity(profileId),
    ]);

    return suggestAccounts({ accounts, categoryId, affinity, exclude: null });
  }

  /** Design 2b's "21 of 23 entries read correctly on the first try". */
  async accuracy(
    profileId: string,
    days = 30,
  ): Promise<{
    windowDays: number;
    total: number;
    correctFirstTime: number;
    accuracyPercent: number | null;
    mostCorrectedField: string | null;
  }> {
    const since = new Date(Date.now() - days * 86_400_000);

    const [resolved, corrections] = await Promise.all([
      this.prisma.reviewQueueItem.findMany({
        where: {
          profileId,
          createdAt: { gte: since },
          status: { in: [ReviewStatus.CONFIRMED, ReviewStatus.EDITED] },
        },
        select: { id: true, status: true },
      }),
      this.prisma.correction.groupBy({
        by: ['field'],
        where: { createdAt: { gte: since }, reviewItem: { profileId } },
        _count: { _all: true },
      }),
    ]);

    const total = resolved.length;
    const correctFirstTime = resolved.filter(
      (item) => item.status === ReviewStatus.CONFIRMED,
    ).length;

    const mostCorrected = [...corrections].sort(
      (a, b) => b._count._all - a._count._all,
    )[0];

    return {
      windowDays: days,
      total,
      correctFirstTime,
      // Null rather than 0 or 100 on an empty window — "0% accurate" would be
      // a lie about a user who simply hasn't used the feature yet.
      accuracyPercent: total === 0 ? null : (correctFirstTime / total) * 100,
      mostCorrectedField: mostCorrected?.field ?? null,
    };
  }
}

/**
 * Clamps and normalises whatever the model returned.
 *
 * `responseSchema` constrains the *shape* — it does not stop the model
 * inventing a negative amount, a confidence of 1.4, or a date in 1970. Every
 * value is checked before it can reach the database.
 *
 * The input is typed as a deeply-partial shape rather than as
 * `ExtractedCandidate`, because that is what it honestly is: parsed JSON from
 * an external system. Declaring it as the finished type would make every guard
 * below look like dead code while doing nothing to make it safe.
 */
type RawCandidate = {
  [K in keyof ExtractedCandidate]?: K extends 'fieldConfidence'
    ? Partial<ExtractedCandidate['fieldConfidence']> | null
    : ExtractedCandidate[K] | null;
};

function sanitise(raw: RawCandidate): ExtractedCandidate {
  const amount =
    typeof raw.amountMinor === 'number' &&
    Number.isFinite(raw.amountMinor) &&
    raw.amountMinor > 0
      ? Math.round(raw.amountMinor)
      : null;

  const clamp = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : 0;

  const date =
    typeof raw.date === 'string' && !Number.isNaN(Date.parse(raw.date))
      ? raw.date
      : null;

  return {
    amountMinor: amount,
    direction: raw.direction === 'CREDIT' ? 'CREDIT' : 'DEBIT',
    category: nonEmpty(raw.category),
    merchant: nonEmpty(raw.merchant),
    date,
    account: nonEmpty(raw.account),
    note: nonEmpty(raw.note),
    confidence: clamp(raw.confidence),
    fieldConfidence: {
      amount: clamp(raw.fieldConfidence?.amount),
      category: clamp(raw.fieldConfidence?.category),
      merchant: clamp(raw.fieldConfidence?.merchant),
      date: clamp(raw.fieldConfidence?.date),
      account: clamp(raw.fieldConfidence?.account),
    },
  };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Resolves a model-supplied name to a real row.
 *
 * Case-insensitive because the model is told the exact names but doesn't
 * always echo the exact casing. A name that matches nothing becomes null
 * rather than a guess — the review queue prompts for it instead.
 */
