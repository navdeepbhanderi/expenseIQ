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
import { RecurrenceGeneratorService } from './recurrence-generator.service';
import {
  ConfirmRecurrenceDto,
  CreateRecurringDto,
  UpdateRecurringDto,
} from './dto/recurring.dto';

@ApiTags('recurring')
@ApiBearerAuth()
@Controller('profiles/:profileId/recurring')
@UseGuards(ProfileAccessGuard)
export class RecurringController {
  constructor(
    private readonly recurring: RecurringService,
    private readonly generator: RecurrenceGeneratorService,
  ) {}

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
      'entered - the same thing the review queue exists to prevent. ' +
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

  @Post('manual')
  @RequireAction('transaction:create')
  @ApiOperation({
    summary: 'Create a recurring entry from scratch',
    description:
      'For schedules the user already knows - a salary on the 1st, rent on ' +
      'the 5th. Detection needs three occurrences before a pattern is ' +
      'visible, which is a quarter for anything monthly, and income may ' +
      'never be detected at all if it is the only credit on the account. ' +
      'Set direction: CREDIT for salary. dayOfMonth clamps to the last day ' +
      'in shorter months, so the 31st still fires in February.',
  })
  createManual(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateRecurringDto,
  ): Promise<RecurringRule> {
    return this.recurring.createManual(profileId, dto);
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

  @Post('generate-due')
  @RequireAction('transaction:create')
  @ApiOperation({
    summary: 'Stage entries for rules that have come due',
    description:
      'Generated entries land in the review queue, not the ledger. A ' +
      "confirmed rule is the user's own instruction, but only for the " +
      "*schedule* - the amount is a prediction, and design 2e's own example " +
      'varies between ₹1,890 and ₹3,120. They arrive fully pre-filled, and a ' +
      'rule with a steady amount is marked CLEAR so it confirms in one tap. ' +
      'Idempotent per rule per due date, so a scheduler firing twice cannot ' +
      "double someone's recorded spending. Phase 6 puts this on a cron.",
  })
  generateDue(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<{ generated: number; skipped: number }> {
    return this.generator.generateDue(profileId);
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
