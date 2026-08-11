import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  Prisma,
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

/** An account plus whatever derived view its type calls for. */
export interface AccountDetail {
  account: Account;
  /** Present for CREDIT_CARD. Design 2d's card panel. */
  card?: CardPosition & { cycle: BillingCycle };
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
      return { account, card: this.cardView(account) };
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

  private cardView(account: Account): CardPosition & { cycle: BillingCycle } {
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

    return {
      ...position,
      cycle: computeBillingCycle({
        statementDay: account.statementDay,
        dueDay: account.dueDay,
      }),
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
