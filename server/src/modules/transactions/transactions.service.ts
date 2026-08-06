import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Direction,
  Prisma,
  TransactionSource,
  type Transaction,
} from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { MerchantsService } from '@/modules/merchants/merchants.service';
import {
  buildPage,
  clampLimit,
  decodeCursor,
  type PageResult,
} from '@/common/pagination/cursor';

import type {
  CreateTransactionDto,
  QueryTransactionsDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';

type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { category: true; account: true; merchant: true };
}>;

/** One entry in the filter sidebar — design 6c's "Groceries 18". */
export interface Facet {
  id: string | null;
  label: string;
  count: number;
}

export interface TransactionListResult extends PageResult<TransactionWithRelations> {
  /** Design 2e's "42 results · ₹64,210". */
  totals: {
    spendMinor: number;
    incomeMinor: number;
    netMinor: number;
  };
  facets: {
    categories: Facet[];
    accounts: Facet[];
    sources: Facet[];
  };
}

const RELATIONS = {
  category: true,
  account: true,
  merchant: true,
} as const;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
  ) {}

  /**
   * The transaction list behind design 2e.
   *
   * Returns three things in one round trip because the screen renders all
   * three at once: the page itself, the totals strip, and the facet counts
   * beside each filter. Splitting them across endpoints would mean the counts
   * and the rows could disagree if a write landed in between.
   *
   * Facets are computed against the filter set *excluding* the dimension being
   * counted. That is what makes them useful: with Groceries selected, the
   * category list must still show what selecting Travel instead would yield,
   * not "Travel 0".
   */
  async list(
    profileId: string,
    query: QueryTransactionsDto,
  ): Promise<TransactionListResult> {
    const limit = clampLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const where = this.buildWhere(profileId, query);

    const cursorClause: Prisma.TransactionWhereInput = cursor
      ? {
          OR: [
            { date: { lt: new Date(cursor.date) } },
            { date: new Date(cursor.date), id: { lt: cursor.id } },
          ],
        }
      : {};

    const [rows, total, totals, categoryFacets, accountFacets, sourceFacets] =
      await Promise.all([
        this.prisma.transaction.findMany({
          where: { AND: [where, cursorClause] },
          include: RELATIONS,
          // id breaks ties so the cursor is stable when several transactions
          // share a date — which they routinely do, since date is a day.
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        }),
        this.prisma.transaction.count({ where }),
        this.computeTotals(where),
        this.categoryFacets(profileId, query),
        this.accountFacets(profileId, query),
        this.sourceFacets(profileId, query),
      ]);

    return {
      ...buildPage(rows, limit, total),
      totals,
      facets: {
        categories: categoryFacets,
        accounts: accountFacets,
        sources: sourceFacets,
      },
    };
  }

  async findById(
    profileId: string,
    transactionId: string,
  ): Promise<TransactionWithRelations> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: RELATIONS,
    });

    if (transaction?.profileId !== profileId || transaction.deletedAt) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async create(
    profileId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionWithRelations> {
    const merchantId = dto.merchant
      ? (
          await this.merchants.record(profileId, dto.merchant, {
            categoryId: dto.categoryId,
            accountId: dto.accountId,
          })
        ).id
      : null;

    return this.prisma.transaction.create({
      data: {
        profileId,
        // Stored as a positive magnitude with the direction alongside, so a
        // query never has to reason about signs to separate spend from income.
        amountMinor: BigInt(Math.abs(dto.amountMinor)),
        direction: dto.direction ?? Direction.DEBIT,
        date: new Date(dto.date),
        categoryId: dto.categoryId ?? null,
        accountId: dto.accountId ?? null,
        merchantId,
        note: dto.note ?? null,
        source: dto.source ?? TransactionSource.MANUAL,
      },
      include: RELATIONS,
    });
  }

  async update(
    profileId: string,
    transactionId: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionWithRelations> {
    await this.findById(profileId, transactionId);

    const data: Prisma.TransactionUpdateInput = {};
    if (dto.amountMinor !== undefined) {
      data.amountMinor = BigInt(Math.abs(dto.amountMinor));
    }
    if (dto.direction !== undefined) data.direction = dto.direction;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }
    if (dto.accountId !== undefined) {
      data.account = dto.accountId
        ? { connect: { id: dto.accountId } }
        : { disconnect: true };
    }
    if (dto.merchant !== undefined) {
      const merchant = await this.merchants.record(profileId, dto.merchant, {
        categoryId: dto.categoryId,
        accountId: dto.accountId,
      });
      data.merchant = { connect: { id: merchant.id } };
    }

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data,
      include: RELATIONS,
    });
  }

  /**
   * Soft delete.
   *
   * The design promises a 10-second undo after confirming a parsed entry, and
   * a row that has been physically removed cannot be restored with its id and
   * relations intact. Soft deletion also keeps a mis-tap from silently
   * altering a historical month's totals with no way back.
   */
  async remove(profileId: string, transactionId: string): Promise<void> {
    await this.findById(profileId, transactionId);

    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { deletedAt: new Date() },
    });
  }

  async restore(
    profileId: string,
    transactionId: string,
  ): Promise<Transaction> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (transaction?.profileId !== profileId) {
      throw new NotFoundException('Transaction not found');
    }

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { deletedAt: null },
    });
  }

  /** Design 2e's Export button. */
  async exportCsv(
    profileId: string,
    query: QueryTransactionsDto,
  ): Promise<string> {
    const rows = await this.prisma.transaction.findMany({
      where: this.buildWhere(profileId, query),
      include: RELATIONS,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      // Bounded so a profile with years of history can't exhaust memory
      // building one string.
      take: 10_000,
    });

    const header = [
      'Date',
      'Merchant',
      'Category',
      'Account',
      'Source',
      'Direction',
      'Amount',
      'Note',
    ];

    const lines = rows.map((row) =>
      [
        row.date.toISOString().slice(0, 10),
        row.merchant?.normalizedName ?? '',
        row.category?.name ?? '',
        row.account?.name ?? '',
        row.source,
        row.direction,
        // Rupees with two decimals: a spreadsheet is the destination, and
        // paise would be read as a whole-number amount 100× too large.
        (Number(row.amountMinor) / 100).toFixed(2),
        row.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    );

    return [header.join(','), ...lines].join('\n');
  }

  // ─── Query building ────────────────────────────────────────────────────────

  private buildWhere(
    profileId: string,
    query: QueryTransactionsDto,
    omit?: 'category' | 'account' | 'source',
  ): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = {
      profileId,
      deletedAt: null,
    };

    if (query.from || query.to) {
      where.date = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        // The end of the range is inclusive of the whole day — a user picking
        // "Aug 1 – Aug 5" means through the end of the 5th, not midnight.
        ...(query.to ? { lte: endOfDay(new Date(query.to)) } : {}),
      };
    }

    if (omit !== 'category' && query.categoryIds?.length) {
      where.categoryId = { in: query.categoryIds };
    }
    if (omit !== 'account' && query.accountIds?.length) {
      where.accountId = { in: query.accountIds };
    }
    if (omit !== 'source' && query.sources?.length) {
      where.source = { in: query.sources };
    }
    if (query.direction) {
      where.direction = query.direction;
    }
    if (
      query.minAmountMinor !== undefined ||
      query.maxAmountMinor !== undefined
    ) {
      where.amountMinor = {
        ...(query.minAmountMinor !== undefined
          ? { gte: BigInt(query.minAmountMinor) }
          : {}),
        ...(query.maxAmountMinor !== undefined
          ? { lte: BigInt(query.maxAmountMinor) }
          : {}),
      };
    }

    if (query.q) {
      // Design 2e: "Search merchant or note".
      where.OR = [
        { note: { contains: query.q, mode: 'insensitive' } },
        {
          merchant: {
            normalizedName: { contains: query.q, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private async computeTotals(
    where: Prisma.TransactionWhereInput,
  ): Promise<TransactionListResult['totals']> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['direction'],
      where,
      _sum: { amountMinor: true },
    });

    const of = (direction: Direction): number =>
      Number(
        grouped.find((row) => row.direction === direction)?._sum.amountMinor ??
          0n,
      );

    const spendMinor = of(Direction.DEBIT);
    const incomeMinor = of(Direction.CREDIT);

    return { spendMinor, incomeMinor, netMinor: incomeMinor - spendMinor };
  }

  private async categoryFacets(
    profileId: string,
    query: QueryTransactionsDto,
  ): Promise<Facet[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: this.buildWhere(profileId, query, 'category'),
      _count: { _all: true },
    });

    const ids = grouped
      .map((row) => row.categoryId)
      .filter((id): id is string => id !== null);

    const categories = await this.prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const names = new Map(categories.map((c) => [c.id, c.name]));

    return grouped
      .map((row) => ({
        id: row.categoryId,
        label: row.categoryId
          ? (names.get(row.categoryId) ?? 'Unknown')
          : 'Uncategorised',
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private async accountFacets(
    profileId: string,
    query: QueryTransactionsDto,
  ): Promise<Facet[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['accountId'],
      where: this.buildWhere(profileId, query, 'account'),
      _count: { _all: true },
    });

    const ids = grouped
      .map((row) => row.accountId)
      .filter((id): id is string => id !== null);

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const names = new Map(accounts.map((a) => [a.id, a.name]));

    return grouped
      .map((row) => ({
        id: row.accountId,
        label: row.accountId
          ? (names.get(row.accountId) ?? 'Unknown')
          : 'No account',
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private async sourceFacets(
    profileId: string,
    query: QueryTransactionsDto,
  ): Promise<Facet[]> {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['source'],
      where: this.buildWhere(profileId, query, 'source'),
      _count: { _all: true },
    });

    return grouped
      .map((row) => ({
        id: row.source,
        label: SOURCE_LABELS[row.source],
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }
}

/** The provenance pills in design 2e. */
const SOURCE_LABELS: Record<TransactionSource, string> = {
  MANUAL: 'Typed',
  NLU_TEXT: 'Typed',
  NLU_VOICE: 'Voice',
  EMAIL: 'Gmail',
  SMS: 'SMS',
  RECEIPT: 'Receipt',
  RECURRING: 'Recurring',
};

function endOfDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/**
 * RFC 4180 quoting, plus one defence that isn't in the RFC.
 *
 * A cell beginning with =, +, - or @ is executed as a formula when the file is
 * opened in Excel or Sheets. Since merchant names and notes come from user
 * input — and, from Phase 4, from parsed emails — an exported ledger is a
 * plausible CSV-injection vector. Prefixing a single quote neutralises it
 * while still displaying the original text.
 */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }

  return guarded;
}
