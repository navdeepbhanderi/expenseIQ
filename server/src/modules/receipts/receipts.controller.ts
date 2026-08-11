import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Receipt } from '@prisma/client';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import {
  ReceiptsService,
  ACCEPTED_MIME_TYPES,
  MAX_RECEIPT_BYTES,
  type ReceiptUploadResult,
} from './receipts.service';

@ApiTags('receipts')
@ApiBearerAuth()
@Controller('profiles/:profileId/receipts')
@UseGuards(ProfileAccessGuard)
// Tighter than NLU's 20/min: every scan is a vision call, which costs several
// times a text one.
@Throttle({ default: { ttl: 60_000, limit: 10 } })
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Post()
  @RequireAction('nlu:parse')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Scan a bill - design 6b\'s "we\'ll read the total"',
    description:
      `Accepts ${ACCEPTED_MIME_TYPES.join(', ')}. Returns as soon as the file ` +
      'is stored rather than waiting for the model: a vision call takes ' +
      'several seconds, and holding the request open means a slow phone ' +
      'upload times out having already succeeded. Watch the receipt status, ' +
      'or just watch the review queue - that is where the result lands.',
  })
  upload(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Receipt> {
    if (!file) {
      throw new BadRequestException(
        'Attach a file under the field name "file"',
      );
    }

    return this.receipts.upload(profileId, file);
  }

  @Get()
  @RequireAction('transaction:view')
  @ApiOperation({ summary: 'Recently scanned receipts' })
  list(
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<Receipt[]> {
    return this.receipts.list(profileId);
  }

  @Get(':receiptId')
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'One receipt, with the review items it produced',
  })
  findOne(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
  ): Promise<ReceiptUploadResult> {
    return this.receipts.findById(profileId, receiptId);
  }
}
