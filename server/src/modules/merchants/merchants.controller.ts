import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Merchant } from '@prisma/client';

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import { MerchantsService } from './merchants.service';
import { RecordMerchantDto, SearchMerchantsDto } from './dto/merchant.dto';

@ApiTags('merchants')
@ApiBearerAuth()
@Controller('profiles/:profileId/merchants')
@UseGuards(ProfileAccessGuard)
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Merchant autocomplete',
    description:
      'Design 6b. Ordered by how often the merchant has been seen, so a ' +
      'frequent one outranks an alphabetically earlier one seen once.',
  })
  search(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: SearchMerchantsDto,
  ): Promise<Merchant[]> {
    return query.q
      ? this.merchants.search(profileId, query.q, query.limit)
      : this.merchants.list(profileId, query.limit);
  }

  @Post()
  @RequireAction('transaction:create')
  @ApiOperation({ summary: 'Register a merchant, or record another sighting' })
  record(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: RecordMerchantDto,
  ): Promise<Merchant> {
    return this.merchants.record(profileId, dto.name, {
      categoryId: dto.defaultCategoryId,
      accountId: dto.defaultAccountId,
    });
  }
}
