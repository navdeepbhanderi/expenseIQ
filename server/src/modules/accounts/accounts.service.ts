import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  Direction,
  Prisma,
  StatementStatus,
  TransactionSource,
  type Account,
  type ProfileRole,
} from '@prisma/client';

import { PrismaService } from '@/infra/prisma/prisma.service';
import { Money } from '@/common/money/money';
import { can } from '@/modules/access/domain/permissions';

import {
  computeBillingCycle,
  computeCardPosition,
  type BillingCycle,
  type CardPosition,
} from './domain/billing-cycle';
import {
  simulatePrepayment,
  summariseLoan,
  type LoanSummary,
  type LoanTerms,
  type PrepaySimulation,
} from './domain/amortization';
import { loanTermsFrom } from './domain/loan-terms';
import type { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { PayAccountDto } from './dto/account.dto';
import { randomUUID } from 'node:crypto';
import { startOfDay } from '@/common/time/calendar';
import { applyBalanceEffect } from '@/modules/transactions/domain/balance-effect';

/** An account plus whatever derived view its type calls for. */
/** The bill, and what has been spent since it was cut. */
export interface StatementView {
  billed: {
    statementDate: Date;
    dueDate: Date;
    amount: Money;
    minimumDue: Money;
    paid: Money;
    /** Amount less what has been paid against it. */
    dueNow: Money;
    isOverdue: boolean;
  } | null;
  /** Spent since the last statement — next cycle's problem, not this one's. */
  unbilled: Money;
}

export interface AccountDetail {
  account: Account;
  /** Present for CREDIT_CARD. Design 2d's card panel. */
  card?: CardPosition & { cycle: BillingCycle; statement: StatementView };
  /** Present for LOAN. Design 2d's loan panel. */
  loan?: LoanSummary;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The credit-product gate.
   *
   * Separate from the route's `@RequireAction` because the restriction depends
   * on the request *body* - a CHILD may add a cash account but not a credit
   * card - and route metadata is evaluated before the body is in scope.
   *
   * The spec is explicit that this is a server-side rule: "Attempting to link
   * a credit card on a CHILD profile → 403 Forbidden".
   */
  assertMayCreate(role: ProfileRole, type: AccountType): void {
    const isCreditProduct =
      type === AccountType.CREDIT_CARD || type === AccountType.LOAN;

    if (isCreditProduct && !can(role, 'account:linkCredit')) {
      throw new ForbiddenException(
        `A ${role.toLowerCase()} profile cannot link a credit card or loan`,
      );
    }
  }

  async list(profileId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { profileId, closedAt: null },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(profileId: string, dto: CreateAccountDto): Promise<Account> {
    this.assertTypeRequirements(dto);

    return this.prisma.account.create({
      data: {
        profileId,
        type: dto.type,
        name: dto.name.trim(),
        issuer: dto.issuer?.trim() ?? null,
        last4: dto.last4 ?? null,
        balanceMinor: BigInt(dto.balanceMinor ?? 0),
        creditLimitMinor:
          dto.creditLimitMinor === undefined
            ? null
            : BigInt(dto.creditLimitMinor),
        statementDay: dto.statementDay ?? null,
        dueDay: dto.dueDay ?? null,
        minDuePercent: dto.minDuePercent ?? 5,
        principalMinor:
          dto.principalMinor === undefined ? null : BigInt(dto.principalMinor),
        emiAmountMinor:
          dto.emiAmountMinor === undefined ? null : BigInt(dto.emiAmountMinor),
        interestRate: dto.interestRate ?? null,
        tenureMonths: dto.tenureMonths ?? null,
        emisPaid: dto.emisPaid ?? 0,
        firstEmiDate: dto.firstEmiDate ? new Date(dto.firstEmiDate) : null,
        isFloatingRate: dto.isFloatingRate ?? false,
        autoDebit: dto.autoDebit ?? false,
      },
    });
  }

  async findById(profileId: string, accountId: string): Promise<Account> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    // 404 rather than 403 for an account on another profile, for the same
    // reason as ProfileAccessGuard: a 403 confirms the id exists.
    if (account?.profileId !== profileId) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }

  /**
   * The account plus its derived position - the whole of design 2d in one call.
   *
   * Computed on read rather than stored. Statement dates, utilisation and the
   * amortisation position are all pure functions of the account's terms and
   * today's date; persisting them would mean every one of them going stale at
   * midnight with no write to trigger a refresh.
   */
  async detail(profileId: string, accountId: string): Promise<AccountDetail> {
    const account = await this.findById(profileId, accountId);

    if (account.type === AccountType.CREDIT_CARD) {
      return { account, card: await this.cardView(account) };
    }

    if (account.type === AccountType.LOAN) {
      return {
        account,
        loan: summariseLoan(toLoanTerms(account), account.emisPaid ?? 0),
      };
    }

    return { account };
  }

  async update(
    profileId: string,
    accountId: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    const account = await this.findById(profileId, accountId);

    const data: Prisma.AccountUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.issuer !== undefined) data.issuer = dto.issuer.trim();
    if (dto.last4 !== undefined) data.last4 = dto.last4;
    if (dto.balanceMinor !== undefined)
      data.balanceMinor = BigInt(dto.balanceMinor);
    if (dto.creditLimitMinor !== undefined) {
      data.creditLimitMinor = BigInt(dto.creditLimitMinor);
    }
    if (dto.statementDay !== undefined) data.statementDay = dto.statementDay;
    if (dto.dueDay !== undefined) data.dueDay = dto.dueDay;
    if (dto.minDuePercent !== undefined) data.minDuePercent = dto.minDuePercent;
    if (dto.interestRate !== undefined) data.interestRate = dto.interestRate;
    if (dto.emiAmountMinor !== undefined) {
      data.emiAmountMinor = BigInt(dto.emiAmountMinor);
    }
    if (dto.emisPaid !== undefined) data.emisPaid = dto.emisPaid;
    if (dto.autoDebit !== undefined) data.autoDebit = dto.autoDebit;
    if (dto.isFloatingRate !== undefined) {
      data.isFloatingRate = dto.isFloatingRate;
    }
    if (dto.principalMinor !== undefined) {
      data.principalMinor = BigInt(dto.principalMinor);
    }
    if (dto.tenureMonths !== undefined) data.tenureMonths = dto.tenureMonths;
    if (dto.firstEmiDate !== undefined) {
      data.firstEmiDate = new Date(dto.firstEmiDate);
    }

    return this.prisma.account.update({ where: { id: account.id }, data });
  }

  /**
   * Closes rather than deletes when the account has history.
   *
   * Deleting would take the transactions with it (or orphan them), which
   * silently rewrites past months of spending. An account the user has
   * genuinely never used is safe to remove outright.
   */
  async remove(
    profileId: string,
    accountId: string,
  ): Promise<{ closed: boolean }> {
    const account = await this.findById(profileId, accountId);

    const transactions = await this.prisma.transaction.count({
      where: { accountId: account.id, deletedAt: null },
    });

    if (transactions === 0) {
      await this.prisma.account.delete({ where: { id: account.id } });
      return { closed: false };
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: { closedAt: new Date() },
    });
    return { closed: true };
  }

  /** Design 2d's "Prepay saving ₹3.9 L". */
  async simulatePrepay(
    profileId: string,
    accountId: string,
    amountMinor: number,
  ): Promise<PrepaySimulation> {
    const account = await this.findById(profileId, accountId);

    if (account.type !== AccountType.LOAN) {
      throw new BadRequestException('Only loans can be prepaid');
    }

    return simulatePrepayment(
      toLoanTerms(account),
      account.emisPaid ?? 0,
      Money.fromMinor(amountMinor),
    );
  }

  private async cardView(
    account: Account,
  ): Promise<CardPosition & { cycle: BillingCycle; statement: StatementView }> {
    if (account.statementDay === null || account.dueDay === null) {
      throw new BadRequestException(
        'This card has no statement or due day configured',
      );
    }

    const position = computeCardPosition({
      // A card's balance is money owed, so it's held as a positive outstanding
      // rather than a negative balance - otherwise every utilisation and
      // minimum-due calculation would need a sign flip.
      outstanding: Money.fromBigInt(account.balanceMinor).abs(),
      creditLimit: Money.fromBigInt(account.creditLimitMinor ?? 0n),
      minDuePercent: account.minDuePercent ?? 5,
    });

    /*
     * What is actually owed *now*, as opposed to what has been spent.
     *
     * The open statement is the bill: fixed when it was cut, due on its own
     * date. Anything spent since belongs to the next cycle and is not owed
     * yet — the distinction the product could not express before, which made
     * "clear this bill" offer to pay for the coffee bought that morning.
     */
    const open = await this.prisma.cardStatement.findFirst({
      where: {
        accountId: account.id,
        status: { in: [StatementStatus.OPEN, StatementStatus.OVERDUE] },
      },
      orderBy: { statementDate: 'asc' },
    });

    const cycle = computeBillingCycle({
      statementDay: account.statementDay,
      dueDay: account.dueDay,
    });

    const dueNow = open ? open.amountMinor - open.paidMinor : 0n;

    return {
      ...position,
      cycle,
      statement: {
        // Null when nothing has been billed yet — a new card, or one settled
        // in full. The UI shows unbilled spend instead of a demand.
        billed: open
          ? {
              statementDate: open.statementDate,
              dueDate: open.dueDate,
              amount: Money.fromBigInt(open.amountMinor),
              minimumDue: Money.fromBigInt(open.minimumDueMinor),
              paid: Money.fromBigInt(open.paidMinor),
              dueNow: Money.fromBigInt(dueNow),
              isOverdue: open.status === StatementStatus.OVERDUE,
            }
          : null,
        /*
         * Spent since the last statement, which is not due yet.
         *
         * Derived rather than stored: it is a running figure by definition,
         * and it stops being interesting the moment it is billed.
         */
        unbilled: Money.fromBigInt(
          BigInt(position.outstanding.minor) - dueNow > 0n
            ? BigInt(position.outstanding.minor) - dueNow
            : 0n,
        ),
      },
    };
  }

  /**
   * Type-specific required fields.
   *
   * Enforced here rather than in the DTO because the requirement is
   * conditional - `creditLimit` is mandatory for a card and meaningless for a
   * bank account, which class-validator can't express without a discriminated
   * union per type.
   */
  private assertTypeRequirements(dto: CreateAccountDto): void {
    if (dto.type === AccountType.CREDIT_CARD) {
      const missing = requiredFields([
        ['creditLimitMinor', dto.creditLimitMinor],
        ['statementDay', dto.statementDay],
        ['dueDay', dto.dueDay],
      ]);

      if (missing.length > 0) {
        throw new BadRequestException({
          message: 'A credit card needs its limit and billing days',
          details: missing,
        });
      }
    }

    if (dto.type === AccountType.LOAN) {
      const missing = requiredFields([
        ['principalMinor', dto.principalMinor],
        ['interestRate', dto.interestRate],
        ['tenureMonths', dto.tenureMonths],
        ['firstEmiDate', dto.firstEmiDate],
      ]);

      if (missing.length > 0) {
        throw new BadRequestException({
          message:
            'A loan needs its principal, rate, tenure and first EMI date',
          details: missing,
        });
      }
    }
  }
  /**
   * Records a payment towards a card or a loan.
   *
   * Written as a transfer pair inside one transaction so the ledger can never
   * hold one half: a debit with no matching credit would silently overstate
   * spending and understate the balance owed, and the two are only meaningful
   * together.
   *
   * The account's own balance is moved as well as the entries being written.
   * For a card, paying reduces the outstanding; for a loan it reduces the
   * principal and advances the instalment count, which is what every
   * amortisation figure on the account page is derived from.
   */
  async pay(
    profileId: string,
    accountId: string,
    dto: PayAccountDto,
  ): Promise<{ transferGroupId: string }> {
    const target = await this.findById(profileId, accountId);
    const source = await this.findById(profileId, dto.fromAccountId);

    if (target.id === source.id) {
      throw new BadRequestException('An account cannot pay itself');
    }

    if (
      target.type !== AccountType.CREDIT_CARD &&
      target.type !== AccountType.LOAN
    ) {
      throw new BadRequestException(
        'Only a credit card or a loan has a balance to pay down',
      );
    }

    const amount = BigInt(dto.amountMinor);
    const when = dto.date ? new Date(dto.date) : startOfDay(new Date());
    const transferGroupId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.createMany({
        data: [
          {
            profileId,
            accountId: source.id,
            amountMinor: amount,
            direction: Direction.DEBIT,
            date: when,
            note: `Payment to ${target.name}`,
            source: TransactionSource.MANUAL,
            isTransfer: true,
            transferGroupId,
          },
          {
            profileId,
            accountId: target.id,
            amountMinor: amount,
            direction: Direction.CREDIT,
            date: when,
            note: `Paid from ${source.name}`,
            source: TransactionSource.MANUAL,
            isTransfer: true,
            transferGroupId,
          },
        ],
      });

      /*
       * Both balances move through the same rule every other write uses.
       *
       * This used to decrement each account by hand. It happened to agree
       * with balanceDelta, but a second copy of the sign rule is exactly how
       * a liability starts being credited instead of debited after someone
       * edits one of them.
       */
      await applyBalanceEffect(
        tx,
        {
          accountId: source.id,
          amountMinor: amount,
          direction: Direction.DEBIT,
        },
        1,
      );

      await applyBalanceEffect(
        tx,
        {
          accountId: target.id,
          amountMinor: amount,
          direction: Direction.CREDIT,
        },
        1,
      );

      if (target.type === AccountType.CREDIT_CARD) {
        /*
         * Settle the oldest open bill first.
         *
         * Which statement a payment lands against is not cosmetic: the oldest
         * is the one that is overdue or about to be, and paying it is what
         * stops the interest. Applying to the newest would leave the one that
         * matters unpaid while the balance looked healthier.
         *
         * Overflow beyond the bill is left alone rather than applied forward
         * — it has already reduced the outstanding, and pre-paying a
         * statement that has not been cut yet would freeze a figure the next
         * cycle is still adding to.
         */
        const open = await tx.cardStatement.findFirst({
          where: {
            accountId: target.id,
            status: {
              in: [StatementStatus.OPEN, StatementStatus.OVERDUE],
            },
          },
          orderBy: { statementDate: 'asc' },
        });

        if (open) {
          const owed = open.amountMinor - open.paidMinor;
          const applied = amount > owed ? owed : amount;

          await tx.cardStatement.update({
            where: { id: open.id },
            data: {
              paidMinor: { increment: applied },
              ...(applied >= owed ? { status: StatementStatus.PAID } : {}),
            },
          });
        }
      }

      if (target.type === AccountType.LOAN) {
        /*
         * A loan payment advances the instalment count.
         *
         * Only when the amount actually covers an EMI — a part payment is a
         * prepayment against principal, and counting it as an instalment
         * would make the remaining-tenure figure lie.
         */
        const coversAnEmi =
          target.emiAmountMinor !== null && amount >= target.emiAmountMinor;

        if (coversAnEmi) {
          await tx.account.update({
            where: { id: target.id },
            data: { emisPaid: { increment: 1 } },
          });
        }
      }
    });

    return { transferGroupId };
  }
}

/**
 * Names the fields that arrived empty.
 *
 * Takes `unknown` deliberately. The DTO types say these are `X | undefined`,
 * but `@IsOptional()` lets an explicit JSON `null` through without touching
 * it, so null genuinely reaches here at runtime - typing it narrowly would
 * make the null branch look like dead code it isn't.
 */
function requiredFields(entries: [string, unknown][]): string[] {
  return entries
    .filter(([, value]) => value === undefined || value === null)
    .map(([field]) => field);
}

/** Throws where the dashboard's loanTermsFrom() returns null: this path is the
 * account-detail endpoint, where a half-configured loan should fail loudly
 * rather than silently render as an empty panel. */
function toLoanTerms(account: Account): LoanTerms {
  const terms = loanTermsFrom(account);

  if (!terms) {
    throw new BadRequestException('This loan is missing its terms');
  }

  return terms;
}
