import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InputMode } from '@prisma/client';
import { Observable } from 'rxjs';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import { NluService, type ParseResult } from './nlu.service';
import { AccuracyQueryDto, ParseDto } from './dto/nlu.dto';

@ApiTags('nlu')
@ApiBearerAuth()
@Controller('profiles/:profileId/nlu')
@UseGuards(ProfileAccessGuard)
// Far tighter than the app-wide 120/min: every call here costs real money,
// and a runaway client loop is a billing incident rather than just load.
@Throttle({ default: { ttl: 60_000, limit: 20 } })
export class NluController {
  constructor(private readonly nlu: NluService) {}

  @Post('parse')
  @RequireAction('nlu:parse')
  @ApiOperation({
    summary: 'Parse natural language into candidate transactions',
    description:
      'Synchronous, not queued — design 5c shows the result inline about a ' +
      'second after the user stops speaking. One input can yield several ' +
      'candidates ("groceries 300, uber 640, bijli 2400" is three). Nothing ' +
      'reaches the ledger: every candidate is staged in the review queue.',
  })
  parse(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: ParseDto,
  ): Promise<ParseResult> {
    return this.nlu.parse(
      profileId,
      { kind: 'text', text: dto.text },
      dto.inputMode ?? InputMode.TEXT,
      dto.text,
    );
  }

  @Sse('parse/stream')
  @RequireAction('nlu:parse')
  @ApiOperation({
    summary: 'Partial readings while the user is still speaking',
    description:
      'Drives design 5b and 3b — "Reading as ₹300 · Groceries · today" ' +
      'appearing mid-sentence. Previews only; nothing here is authoritative ' +
      'and nothing is written. Call POST /parse to actually stage an entry.',
  })
  stream(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    // Typed optional because a caller can omit it; the DTO cannot validate a
    // query param on an SSE route without buffering the stream.
    @Query('text') text: string | undefined,
  ): Observable<{ data: unknown }> {
    return new Observable((subscriber) => {
      void (async () => {
        try {
          for await (const partial of this.nlu.stream(profileId, {
            kind: 'text',
            text: text ?? '',
          })) {
            subscriber.next({ data: partial });
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  @Get('accuracy')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'How often parses are right first time',
    description:
      'Design 2b: "21 of 23 entries read correctly on the first try". ' +
      'Returns null accuracy on an empty window rather than 0% — a user who ' +
      'has not used the feature is not 0% accurate.',
  })
  accuracy(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: AccuracyQueryDto,
  ) {
    return this.nlu.accuracy(profileId, query.days ?? 30);
  }
}
