import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewStatus } from '@prisma/client';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import { ReviewQueueService, type ConfirmResult } from './review-queue.service';
import {
  BulkConfirmDto,
  EditReviewItemDto,
  ReviewQueueQueryDto,
  UndoDto,
} from './dto/review-queue.dto';

@ApiTags('review-queue')
@ApiBearerAuth()
@Controller('profiles/:profileId/review-queue')
@UseGuards(ProfileAccessGuard)
export class ReviewQueueController {
  constructor(private readonly queue: ReviewQueueService) {}

  @Get()
  @RequireAction('reviewQueue:manage')
  @ApiOperation({
    summary: 'Entries waiting to be confirmed',
    description:
      'Oldest first — design 6e nudges about entries that have been waiting.',
  })
  list(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: ReviewQueueQueryDto,
  ) {
    return this.queue.list(profileId, query.status ?? ReviewStatus.PENDING);
  }

  @Get('summary')
  @RequireAction('reviewQueue:manage')
  @ApiOperation({
    summary:
      'Design 2b\'s header — "3 waiting · 2 look clear · 1 needs an account"',
  })
  summary(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.queue.summary(profileId);
  }

  @Get(':itemId')
  @RequireAction('reviewQueue:manage')
  @ApiOperation({ summary: 'One entry, with the raw input that produced it' })
  findOne(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.queue.findById(profileId, itemId);
  }

  @Patch(':itemId')
  @RequireAction('reviewQueue:manage')
  @ApiOperation({
    summary: 'Correct a parsed entry',
    description:
      'Every changed field is recorded as a Correction. Those corrections ' +
      'are the feedback loop — they drive the accuracy stat and, later, ' +
      'per-profile category learning.',
  })
  edit(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: EditReviewItemDto,
  ) {
    return this.queue.edit(profileId, itemId, dto);
  }

  @Post(':itemId/confirm')
  @RequireAction('reviewQueue:manage')
  @ApiOperation({
    summary: 'Move the entry into the ledger',
    description:
      'The only path by which AI-parsed data becomes a transaction. Returns ' +
      'an undo token valid for 10 seconds.',
  })
  confirm(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<ConfirmResult> {
    return this.queue.confirm(profileId, itemId);
  }

  @Post('confirm')
  @RequireAction('reviewQueue:manage')
  @ApiOperation({
    summary: 'Design 4b\'s "Add all three"',
    description:
      'Partial success is reported rather than aborting: one entry missing ' +
      'an amount must not stop the others landing.',
  })
  confirmMany(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: BulkConfirmDto,
  ) {
    return this.queue.confirmMany(profileId, dto.itemIds);
  }

  @Post(':itemId/discard')
  @RequireAction('reviewQueue:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Drop the entry without adding it' })
  discard(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.queue.discard(profileId, itemId);
  }

  @Post('undo')
  @RequireAction('reviewQueue:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Take back a confirmation within 10 seconds',
    description:
      'The window is enforced server-side — a client timer alone would let a ' +
      'stale tab undo a transaction from last week.',
  })
  undo(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: UndoDto,
  ): Promise<void> {
    return this.queue.undo(profileId, dto.token);
  }
}
