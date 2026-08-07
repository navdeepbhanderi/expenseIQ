import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Reminder } from '@prisma/client';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import { RemindersService, type ReminderRun } from './reminders.service';
import { SetReminderDto } from './dto/reminder.dto';

@ApiTags('reminders')
@ApiBearerAuth()
@Controller('profiles/:profileId')
@UseGuards(ProfileAccessGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('accounts/:accountId/reminders')
  @RequireAction('account:view')
  @ApiOperation({ summary: 'Reminder settings for an account' })
  list(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<Reminder[]> {
    return this.reminders.forAccount(profileId, accountId);
  }

  @Put('accounts/:accountId/reminders')
  @RequireAction('account:edit')
  @ApiOperation({
    summary: 'Set the reminder — design 6h\'s "3 days ahead, 9 am"',
    description:
      'Editing preserves which cycle has already been notified, so changing ' +
      'the offset mid-cycle cannot send a duplicate.',
  })
  set(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() dto: SetReminderDto,
  ): Promise<Reminder> {
    return this.reminders.set(profileId, accountId, dto);
  }

  @Delete('accounts/:accountId/reminders')
  @RequireAction('account:edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop reminding about this account' })
  remove(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<void> {
    return this.reminders.remove(profileId, accountId);
  }

  @Post('reminders/scan')
  @RequireAction('account:view')
  @ApiOperation({
    summary: 'Run the reminder scan for this profile',
    description:
      'Idempotent per billing cycle: a second run the same day sends ' +
      'nothing. The scheduler calls this across every profile; it is exposed ' +
      'so a user can trigger their own and so it is testable.',
  })
  scan(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<ReminderRun> {
    return this.reminders.runScan(profileId);
  }
}
