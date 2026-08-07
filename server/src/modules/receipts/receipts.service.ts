import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  InputMode,
  ReceiptStatus,
  TransactionSource,
  type Receipt,
} from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { StorageService } from '@/infra/storage/storage.service';
import { AppLogger } from '@/common/logger/app-logger.service';
import { QUEUE_PORT, QUEUES, type QueuePort } from '@/infra/queue/queue.port';
import { NluService } from '@/modules/nlu/nlu.service';

/**
 * Design 6b: "Drop a bill or screenshot · PDF, JPG · we'll read the total".
 *
 * Gemini reads JPG, PNG and PDF natively, so there is no separate vision
 * model and no rasterisation step — the file goes to the same LlmPort the
 * text pipeline uses, with `kind: 'image'`.
 */
export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

/** Phone photos are routinely 5–8 MB; 15 leaves room without inviting abuse. */
export const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

/**
 * Vision requests cost several times a text request, so uploads are capped
 * per profile per day. This is the "receipt cost cap" flagged as an open item
 * in the plan — a runaway client here is a billing incident, not just load.
 */
export const MAX_RECEIPTS_PER_DAY = 50;

export interface ReceiptUploadResult {
  receipt: Receipt;
  /** Present once parsing has run; null while still pending. */
  reviewItemIds: string[];
}

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly nlu: NluService,
    @Inject(QUEUE_PORT) private readonly queue: QueuePort,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('Receipts');
  }

  /**
   * Accepts a bill and schedules it for parsing.
   *
   * Returns as soon as the file is stored rather than waiting for the model.
   * A vision call takes several seconds, and holding the request open for it
   * means a slow upload on a phone connection times out having already
   * succeeded. The client watches the receipt's status, or simply watches the
   * review queue — which is where the result lands either way.
   */
  async upload(
    profileId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<Receipt> {
    this.assertAcceptable(file);
    await this.assertUnderDailyCap(profileId);

    const fingerprint = StorageService.fingerprint(file.buffer);

    // The same bill photographed twice, or a retried upload, must not become
    // two review items. Matched on content, so a renamed file is still caught.
    const existing = await this.prisma.receipt.findFirst({
      where: {
        profileId,
        storageRef: { startsWith: fingerprint.slice(0, 16) },
      },
    });

    if (existing) {
      this.logger.log('Duplicate receipt ignored', {
        profileId,
        receiptId: existing.id,
      });
      return existing;
    }

    const reference = await this.storage.put(
      file.buffer,
      extensionFor(file.mimetype),
    );

    const receipt = await this.prisma.receipt.create({
      data: {
        profileId,
        // The fingerprint is prefixed onto the reference so duplicate
        // detection needs no extra column or index.
        storageRef: `${fingerprint.slice(0, 16)}/${reference}`,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.byteLength,
        status: ReceiptStatus.PENDING,
      },
    });

    await this.queue.enqueue(QUEUES.receiptParse, {
      receiptId: receipt.id,
      profileId,
    });

    return receipt;
  }

  /**
   * The queue handler: reads the stored file, parses it, stages candidates.
   *
   * Registered in the module rather than called directly, so it runs inline in
   * tests and on a worker in production without the caller knowing.
   */
  async parseStoredReceipt(receiptId: string): Promise<void> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
    });

    if (receipt?.status !== ReceiptStatus.PENDING) {
      return;
    }

    try {
      const data = await this.storage.get(stripFingerprint(receipt.storageRef));

      const result = await this.nlu.parse(
        receipt.profileId,
        { kind: 'image', data, mimeType: receipt.mimeType },
        InputMode.IMAGE,
        `Receipt · ${receipt.mimeType}`,
        TransactionSource.RECEIPT,
      );

      await this.prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          status: ReceiptStatus.PARSED,
          nluRequestId: result.requestId,
        },
      });

      this.logger.log('Receipt parsed', {
        receiptId,
        candidates: result.candidates.length,
      });
    } catch (error) {
      // Marked FAILED rather than left PENDING forever. NluService has already
      // preserved a review item carrying the raw reference, so the user can
      // still enter the expense by hand — the spec's rule that input is never
      // silently dropped applies to a photograph as much as to speech.
      await this.prisma.receipt.update({
        where: { id: receipt.id },
        data: { status: ReceiptStatus.FAILED },
      });

      this.logger.error('Receipt parsing failed', undefined, {
        receiptId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async findById(
    profileId: string,
    receiptId: string,
  ): Promise<ReceiptUploadResult> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
    });

    if (receipt?.profileId !== profileId) {
      throw new NotFoundException('Receipt not found');
    }

    const reviewItems = receipt.nluRequestId
      ? await this.prisma.reviewQueueItem.findMany({
          where: { nluRequestId: receipt.nluRequestId },
          select: { id: true },
        })
      : [];

    return { receipt, reviewItemIds: reviewItems.map((item) => item.id) };
  }

  async list(profileId: string, limit = 25): Promise<Receipt[]> {
    return this.prisma.receipt.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private assertAcceptable(file: { buffer: Buffer; mimetype: string }): void {
    if (file.buffer.byteLength === 0) {
      throw new BadRequestException('The uploaded file is empty');
    }

    if (file.buffer.byteLength > MAX_RECEIPT_BYTES) {
      throw new PayloadTooLargeException(
        `Receipts must be under ${MAX_RECEIPT_BYTES / 1024 / 1024} MB`,
      );
    }

    if (!ACCEPTED_MIME_TYPES.includes(file.mimetype as never)) {
      throw new UnsupportedMediaTypeException(
        `Upload a photo or PDF. Received ${file.mimetype}.`,
      );
    }
  }

  private async assertUnderDailyCap(profileId: string): Promise<void> {
    const since = new Date(Date.now() - 86_400_000);

    const today = await this.prisma.receipt.count({
      where: { profileId, createdAt: { gte: since } },
    });

    if (today >= MAX_RECEIPTS_PER_DAY) {
      throw new BadRequestException({
        message: `You can scan ${MAX_RECEIPTS_PER_DAY} receipts a day. Try again tomorrow.`,
        details: { scannedToday: today, limit: MAX_RECEIPTS_PER_DAY },
      });
    }
  }
}

function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'application/pdf': 'pdf',
  };
  return map[mimeType] ?? 'bin';
}

/** Storage refs carry a `fingerprint/` prefix for duplicate detection. */
function stripFingerprint(storageRef: string): string {
  const separator = storageRef.indexOf('/');
  return separator === -1 ? storageRef : storageRef.slice(separator + 1);
}
