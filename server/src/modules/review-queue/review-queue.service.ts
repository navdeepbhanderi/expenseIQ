import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConfidenceBand,
  Prisma,
  ReviewStatus,
  type Transaction,
} from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { MerchantsService } from '@/modules/merchants/merchants.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import { canOneTapConfirm } from '@/modules/nlu/domain/confidence';

import type { EditReviewItemDto } from './dto/review-queue.dto';

/** Design 2b and 3e both promise a 10-second window to take it back. */
export const UNDO_WINDOW_MS = 10_000;

export interface ConfirmResult {
  transaction: Transaction;
  /** Present while the undo window is open. */
  undo: { token: string; expiresAt: Date } | null;
}

@Injectable()
export class ReviewQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('ReviewQueue');
  }

  async list(profileId: string, status: ReviewStatus = ReviewStatus.PENDING) {
    return this.prisma.reviewQueueItem.findMany({
      where: { profileId, status },
      include: {
        nluRequest: {
          select: { rawInput: true, inputMode: true, detectedLanguage: true },
        },
      },
      // Oldest first: design 6e nudges about "3 entries waiting 2 days", so
      // the queue should surface what has been sitting longest.
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(profileId: string, itemId: string) {
    const item = await this.prisma.reviewQueueItem.findUnique({
      where: { id: itemId },
      include: { nluRequest: true },
    });

    if (item?.profileId !== profileId) {
      throw new NotFoundException('Review item not found');
    }

    return item;
  }

  /**
   * Applies the user's corrections and records what changed.
   *
   * The corrections are the point. They drive design 2b's accuracy stat and,
   * later, per-profile category learning — so an edit that silently overwrote
   * the parse would throw away the most valuable signal the product collects.
   */
  async edit(profileId: string, itemId: string, dto: EditReviewItemDto) {
    const item = await this.findById(profileId, itemId);

    if (item.status !== ReviewStatus.PENDING) {
      throw new BadRequestException('This entry has already been resolved');
    }

    const corrections: Prisma.CorrectionCreateManyInput[] = [];
    const data: Prisma.ReviewQueueItemUpdateInput = {};

    // Narrowed to what actually flows through here. `unknown` would let an
    // object be stringified to "[object Object]" and stored as a correction,
    // which would quietly corrupt the accuracy stat these rows feed.
    type Trackable = string | number | bigint | null | undefined;

    const track = (
      field: string,
      before: Trackable,
      after: Trackable,
    ): void => {
      const from = before == null ? null : String(before);
      const to = after == null ? null : String(after);
      if (from !== to) {
        corrections.push({
          reviewItemId: itemId,
          field,
          oldValue: from,
          newValue: to,
        });
      }
    };

    if (dto.amountMinor !== undefined) {
      track(
        'amount',
        item.parsedAmountMinor?.toString() ?? null,
        dto.amountMinor,
      );
      data.parsedAmountMinor = BigInt(Math.abs(dto.amountMinor));
    }
    if (dto.direction !== undefined) {
      track('direction', item.parsedDirection, dto.direction);
      data.parsedDirection = dto.direction;
    }
    if (dto.categoryId !== undefined) {
      track('category', item.parsedCategoryId, dto.categoryId);
      data.parsedCategoryId = dto.categoryId;
    }
    if (dto.accountId !== undefined) {
      track('account', item.parsedAccountId, dto.accountId);
      data.parsedAccountId = dto.accountId;
    }
    if (dto.merchant !== undefined) {
      track('merchant', item.parsedMerchant, dto.merchant);
      data.parsedMerchant = dto.merchant;
    }
    if (dto.date !== undefined) {
      track(
        'date',
        item.parsedDate?.toISOString().slice(0, 10) ?? null,
        dto.date,
      );
      data.parsedDate = new Date(dto.date);
    }
    if (dto.note !== undefined) {
      track('note', item.parsedNote, dto.note);
      data.parsedNote = dto.note;
    }

    // Recomputed after the edit: a user who filled in the missing amount has
    // resolved the very thing that was blocking one-tap confirmation.
    const updated = await this.prisma.$transaction(async (tx) => {
      if (corrections.length > 0) {
        await tx.correction.createMany({ data: corrections });
      }

      const next = await tx.reviewQueueItem.update({
        where: { id: itemId },
        data,
      });

      return tx.reviewQueueItem.update({
        where: { id: itemId },
        data: { missingFields: recomputeMissing(next) },
      });
    });

    return updated;
  }

  /**
   * Moves a reviewed entry into the ledger.
   *
   * This is the only path by which AI-parsed data becomes a transaction, and
   * it requires an explicit call — the human-in-the-loop rule the whole
   * product is built around.
   */
  async confirm(profileId: string, itemId: string): Promise<ConfirmResult> {
    const item = await this.findById(profileId, itemId);

    if (item.status !== ReviewStatus.PENDING) {
      throw new BadRequestException('This entry has already been resolved');
    }

    if (item.parsedAmountMinor === null || item.parsedAmountMinor <= 0n) {
      // Design 3d: "amount not found — add it to continue".
      throw new BadRequestException({
        message: 'Add an amount before confirming this entry',
        details: { missingFields: item.missingFields },
      });
    }

    const merchantId = item.parsedMerchant
      ? (
          await this.merchants.record(profileId, item.parsedMerchant, {
            categoryId: item.parsedCategoryId,
            accountId: item.parsedAccountId,
          })
        ).id
      : null;

    // Whether the user corrected anything decides CONFIRMED vs EDITED, which
    // is what the "read correctly on the first try" stat counts.
    const correctionCount = await this.prisma.correction.count({
      where: { reviewItemId: itemId },
    });

    const transaction = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          profileId,
          amountMinor: item.parsedAmountMinor!,
          direction: item.parsedDirection,
          date: item.parsedDate ?? new Date(),
          categoryId: item.parsedCategoryId,
          accountId: item.parsedAccountId,
          merchantId,
          note: item.parsedNote,
          source: item.source,
          nluRequestId: item.nluRequestId,
          sourceLanguage: null,
        },
      });

      await tx.reviewQueueItem.update({
        where: { id: itemId },
        data: {
          status:
            correctionCount > 0 ? ReviewStatus.EDITED : ReviewStatus.CONFIRMED,
          resolvedAt: new Date(),
        },
      });

      return created;
    });

    this.logger.log('Review item confirmed into the ledger', {
      profileId,
      itemId,
      transactionId: transaction.id,
      corrected: correctionCount > 0,
    });

    return {
      transaction,
      undo: {
        // The transaction id *is* the token. It's a uuid the caller already
        // holds, it's scoped to this profile by the undo endpoint's guard, and
        // inventing a second secret would add storage without adding safety.
        token: transaction.id,
        expiresAt: new Date(Date.now() + UNDO_WINDOW_MS),
      },
    };
  }

  /** Design 4b's "Add all three". */
  async confirmMany(
    profileId: string,
    itemIds: string[],
  ): Promise<{
    confirmed: ConfirmResult[];
    failed: { itemId: string; reason: string }[];
  }> {
    const confirmed: ConfirmResult[] = [];
    const failed: { itemId: string; reason: string }[] = [];

    for (const itemId of itemIds) {
      try {
        confirmed.push(await this.confirm(profileId, itemId));
      } catch (error) {
        // One unconfirmable entry must not abort the batch — design 4b shows
        // three candidates where one is missing an account, and the other two
        // should still land.
        failed.push({
          itemId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { confirmed, failed };
  }

  async discard(profileId: string, itemId: string): Promise<void> {
    const item = await this.findById(profileId, itemId);

    if (item.status !== ReviewStatus.PENDING) {
      throw new BadRequestException('This entry has already been resolved');
    }

    await this.prisma.reviewQueueItem.update({
      where: { id: itemId },
      data: { status: ReviewStatus.DISCARDED, resolvedAt: new Date() },
    });
  }

  /**
   * Takes back a confirmation inside the undo window.
   *
   * Soft-deletes the transaction and returns the item to PENDING, so the user
   * lands back where they were rather than losing what they said.
   *
   * The window is enforced server-side. A client timer alone would let a stale
   * tab undo a transaction from last week.
   */
  async undo(profileId: string, transactionId: string): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (transaction?.profileId !== profileId) {
      throw new NotFoundException('Nothing to undo');
    }

    const age = Date.now() - transaction.createdAt.getTime();
    if (age > UNDO_WINDOW_MS) {
      throw new BadRequestException({
        message: 'The undo window has passed — edit or delete it instead',
        details: { transactionId },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: { deletedAt: new Date() },
      });

      const item = await tx.reviewQueueItem.findFirst({
        where: {
          profileId,
          nluRequestId: transaction.nluRequestId,
          resolvedAt: { not: null },
        },
        orderBy: { resolvedAt: 'desc' },
      });

      if (item) {
        await tx.reviewQueueItem.update({
          where: { id: item.id },
          data: { status: ReviewStatus.PENDING, resolvedAt: null },
        });
      }
    });

    this.logger.log('Confirmation undone', { profileId, transactionId });
  }

  /** Design 2b's header: "3 waiting · 2 look clear · 1 needs an account". */
  async summary(profileId: string) {
    const items = await this.prisma.reviewQueueItem.findMany({
      where: { profileId, status: ReviewStatus.PENDING },
      select: { confidenceBand: true, missingFields: true },
    });

    return {
      pending: items.length,
      clear: items.filter((item) =>
        canOneTapConfirm(
          item.confidenceBand ?? ConfidenceBand.NEEDS_FIELD,
          item.missingFields,
        ),
      ).length,
      needsAField: items.filter((item) => item.missingFields.length > 0).length,
    };
  }
}

function recomputeMissing(item: {
  parsedAmountMinor: bigint | null;
  parsedCategoryId: string | null;
  parsedAccountId: string | null;
  parsedDate: Date | null;
}): string[] {
  const missing: string[] = [];

  if (item.parsedAmountMinor === null || item.parsedAmountMinor <= 0n) {
    missing.push('amount');
  }
  if (!item.parsedCategoryId) missing.push('category');
  if (!item.parsedAccountId) missing.push('account');
  if (!item.parsedDate) missing.push('date');

  return missing;
}
