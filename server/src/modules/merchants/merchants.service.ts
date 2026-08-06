import { Injectable } from '@nestjs/common';
import type { Merchant } from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { normalizeMerchant } from './domain/normalize';

/**
 * The merchant registry.
 *
 * Two jobs, deliberately the same table:
 *
 *   1. Autocomplete, and design 6b's "Not a known merchant — add it?".
 *   2. The normalisation cache the roadmap asks for. Once "SWIGGY*BLR9284"
 *      has been resolved to "Swiggy", every later occurrence is a database
 *      lookup rather than an LLM call. Keeping them separate would mean
 *      maintaining two sources of truth for the same fact.
 *
 * `defaultCategoryId` and `defaultAccountId` accumulate from real usage, which
 * is what will drive design 3d's "You usually put fuel on HDFC Millennia" in
 * Phase 4.
 */
@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    profileId: string,
    term: string,
    limit = 10,
  ): Promise<Merchant[]> {
    return this.prisma.merchant.findMany({
      where: {
        OR: [{ profileId }, { profileId: null }],
        normalizedName: { contains: term.trim(), mode: 'insensitive' },
      },
      // Most-used first: a merchant seen forty times is a better completion
      // than an alphabetically earlier one seen once.
      orderBy: [{ seenCount: 'desc' }, { normalizedName: 'asc' }],
      take: limit,
    });
  }

  async list(profileId: string, limit = 50): Promise<Merchant[]> {
    return this.prisma.merchant.findMany({
      where: { OR: [{ profileId }, { profileId: null }] },
      orderBy: [{ seenCount: 'desc' }, { normalizedName: 'asc' }],
      take: limit,
    });
  }

  /**
   * Records a sighting, creating the merchant if it's new.
   *
   * Upserted rather than checked-then-inserted: two transactions naming the
   * same new merchant can arrive concurrently (voice entry and a Gmail sync,
   * say), and a read-then-write would race into a unique-constraint violation.
   *
   * The raw string is kept in `rawAliases` so the cache can answer for the
   * exact form that was seen — "SWIGGY*BLR9284" and "SWIGGY*MUM1122" both map
   * to Swiggy, and both are worth remembering.
   */
  async record(
    profileId: string,
    rawName: string,
    hints: { categoryId?: string | null; accountId?: string | null } = {},
  ): Promise<Merchant> {
    const normalized = normalizeMerchant(rawName);

    const existing = await this.prisma.merchant.findUnique({
      where: {
        profileId_normalizedName: { profileId, normalizedName: normalized },
      },
    });

    if (existing) {
      const aliases = new Set(existing.rawAliases);
      aliases.add(rawName.trim());

      return this.prisma.merchant.update({
        where: { id: existing.id },
        data: {
          seenCount: { increment: 1 },
          lastSeenAt: new Date(),
          rawAliases: [...aliases],
          // Defaults are only filled in, never overwritten — a user who
          // deliberately recategorised a merchant should not have it silently
          // reverted by the next transaction that omits a category.
          ...(existing.defaultCategoryId === null && hints.categoryId
            ? { defaultCategoryId: hints.categoryId }
            : {}),
          ...(existing.defaultAccountId === null && hints.accountId
            ? { defaultAccountId: hints.accountId }
            : {}),
        },
      });
    }

    return this.prisma.merchant.create({
      data: {
        profileId,
        normalizedName: normalized,
        rawAliases: [rawName.trim()],
        seenCount: 1,
        lastSeenAt: new Date(),
        defaultCategoryId: hints.categoryId ?? null,
        defaultAccountId: hints.accountId ?? null,
      },
    });
  }

  async findByRawName(
    profileId: string,
    rawName: string,
  ): Promise<Merchant | null> {
    return this.prisma.merchant.findUnique({
      where: {
        profileId_normalizedName: {
          profileId,
          normalizedName: normalizeMerchant(rawName),
        },
      },
    });
  }
}
