import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RecurringRule } from '@prisma/client';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import {
  RecurringService,
  type RecurrenceSuggestion,
} from './recurring.service';
import { ConfirmRecurrenceDto, UpdateRecurringDto } from './dto/recurring.dto';

@ApiTags('recurring')
@ApiBearerAuth()
@Controller('profiles/:profileId/recurring')
@UseGuards(ProfileAccessGuard)
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  @RequireAction('transaction:view')
  @ApiOperation({ summary: 'Confirmed recurring payments' })
  list(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<RecurringRule[]> {
    return this.recurring.list(profileId);
  }

  @Get('detected')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Patterns found in history, as suggestions',
    description:
      'Never auto-created. A detected pattern that silently started ' +
      'generating transactions would put rows in the ledger the user never ' +
      'entered — the same thing the review queue exists to prevent. ' +
      'Detection proposes; the user disposes. Amount variance does not ' +
      'disqualify a pattern: an electricity bill is recurring and is a ' +
      'different number every month.',
  })
  detected(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<RecurrenceSuggestion[]> {
    return this.recurring.detect(profileId);
  }

  @Post()
  @RequireAction('transaction:create')
  @ApiOperation({ summary: 'Accept a detected pattern as a rule' })
  confirm(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: ConfirmRecurrenceDto,
  ): Promise<RecurringRule> {
    return this.recurring.confirmDetected(profileId, dto);
  }

  @Post(':ruleId/label-transactions')
  @RequireAction('transaction:edit')
  @ApiOperation({
    summary: 'Tag matching transactions with this rule',
    description:
      'Puts the "Recurring" pill on rows in design 2e. Applied to history as ' +
      'well as future entries, so accepting a rule immediately labels the ' +
      'payments that revealed it.',
  })
  label(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ): Promise<{ labelled: number }> {
    return this.recurring.labelMatchingTransactions(profileId, ruleId);
  }

  @Patch(':ruleId')
  @RequireAction('transaction:edit')
  @ApiOperation({ summary: 'Adjust or disable a rule' })
  update(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateRecurringDto,
  ): Promise<RecurringRule> {
    return this.recurring.update(profileId, ruleId, dto);
  }

  @Delete(':ruleId')
  @RequireAction('transaction:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Forget a rule' })
  remove(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ): Promise<void> {
    return this.recurring.remove(profileId, ruleId);
  }
}
