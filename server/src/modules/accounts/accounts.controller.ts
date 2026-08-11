import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountType, type Account } from '@prisma/client';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';
import { CurrentProfile } from '@/common/decorators/current-profile.decorator';
import type { ProfileAccess } from '@/common/types/express';

import { AccountsService, type AccountDetail } from './accounts.service';
import {
  CreateAccountDto,
  PayAccountDto,
  PrepaySimulationDto,
  UpdateAccountDto,
} from './dto/account.dto';
import type { PrepaySimulation } from './domain/amortization';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller('profiles/:profileId/accounts')
@UseGuards(ProfileAccessGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequireAction('account:view')
  @ApiOperation({ summary: 'Open accounts on this profile' })
  list(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<Account[]> {
    return this.accounts.list(profileId);
  }

  @Post()
  @RequireAction('account:create')
  @ApiOperation({
    summary: 'Add a bank account, card or loan',
    description:
      'Cards and loans additionally require `account:linkCredit`, which a ' +
      'CHILD role does not have - enforced here, not just hidden in the UI.',
  })
  create(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateAccountDto,
    @CurrentProfile() access: ProfileAccess,
  ): Promise<Account> {
    // A second, narrower check than the route's @RequireAction, because
    // whether a credit product is involved depends on the request body rather
    // than the route - which decorator metadata cannot see.
    this.accounts.assertMayCreate(access.role, dto.type);
    return this.accounts.create(profileId, dto);
  }

  @Get(':accountId')
  @RequireAction('account:view')
  @ApiOperation({
    summary: 'Account detail with its derived position',
    description:
      'Cards return statement/due dates, available credit, minimum due and ' +
      'utilisation. Loans return the amortisation position - EMIs paid, ' +
      'principal vs interest, and the closure date. All of design 2d.',
  })
  detail(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<AccountDetail> {
    return this.accounts.detail(profileId, accountId);
  }

  @Patch(':accountId')
  @RequireAction('account:edit')
  @ApiOperation({ summary: 'Update account details' })
  update(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<Account> {
    return this.accounts.update(profileId, accountId, dto);
  }

  @Post(':accountId/prepay-simulation')
  @RequireAction('account:view')
  @ApiOperation({
    summary: 'What a lump-sum prepayment would save',
    description:
      'Design 2d\'s "Prepay saving ₹3.9 L". Models the common arrangement ' +
      'where the EMI stays fixed and the tenure shortens.',
  })
  simulatePrepay(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: PrepaySimulationDto,
  ): Promise<PrepaySimulation> {
    return this.accounts.simulatePrepay(profileId, accountId, dto.amountMinor);
  }

  @Delete(':accountId')
  @RequireAction('account:delete')
  @ApiOperation({
    summary: 'Close or delete an account',
    description:
      'An account with transactions is closed, not deleted - removing it ' +
      'would rewrite past months of spending. An unused account is removed.',
  })
  remove(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<{ closed: boolean }> {
    return this.accounts.remove(profileId, accountId);
  }
  @Post(':accountId/pay')
  @RequireAction('transaction:create')
  @ApiOperation({
    summary: 'Pay a card bill or a loan EMI from another account',
    description:
      'Writes a transfer pair — money out of the paying account, in against ' +
      'the card or loan — and moves both balances. Neither entry counts as ' +
      'spending: the expense was recorded when the card was swiped, so ' +
      'counting the payment too would double it and inflate every budget and ' +
      'norm derived from the month.',
  })
  pay(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: PayAccountDto,
  ): Promise<{ transferGroupId: string }> {
    return this.accounts.pay(profileId, accountId, dto);
  }
}

/** Re-exported so the service can reference the enum without importing Prisma twice. */
export { AccountType };
