import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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

import { ProfileAccessGuard } from '@/modules/access/profile-access.guard';
import { RequireAction } from '@/modules/access/require-action.decorator';

import {
  TransactionsService,
  type TransactionListResult,
} from './transactions.service';
import {
  CreateTransactionDto,
  QueryTransactionsDto,
  UpdateTransactionDto,
} from './dto/transaction.dto';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('profiles/:profileId/transactions')
@UseGuards(ProfileAccessGuard)
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @RequireAction('transaction:view')
  @ApiOperation({
    summary: 'Filtered, paginated transactions',
    description:
      'Returns the page, the totals strip ("42 results · ₹64,210") and the ' +
      'facet counts beside each filter ("Groceries 18") in one round trip — ' +
      'design 2e renders all three at once, and separate calls could ' +
      'disagree if a write landed between them.',
  })
  list(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: QueryTransactionsDto,
  ): Promise<TransactionListResult> {
    return this.transactions.list(profileId, query);
  }

  @Get('export')
  @RequireAction('transaction:view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="expenseiq-export.csv"')
  @ApiOperation({
    summary: 'Export the current filter as CSV',
    description:
      'Honours every filter the list endpoint does, so what you export is ' +
      'what you were looking at.',
  })
  export(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: QueryTransactionsDto,
  ): Promise<string> {
    return this.transactions.exportCsv(profileId, query);
  }

  @Post()
  @RequireAction('transaction:create')
  @ApiOperation({ summary: 'Log a transaction' })
  create(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactions.create(profileId, dto);
  }

  @Get(':transactionId')
  @RequireAction('transaction:view')
  @ApiOperation({ summary: "One transaction — design 6g's detail panel" })
  findOne(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactions.findById(profileId, transactionId);
  }

  @Patch(':transactionId')
  @RequireAction('transaction:edit')
  @ApiOperation({ summary: 'Correct a transaction' })
  update(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactions.update(profileId, transactionId, dto);
  }

  @Delete(':transactionId')
  @RequireAction('transaction:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a transaction',
    description:
      'Soft delete — the design promises a 10-second undo after confirming a ' +
      'parsed entry, and a physically removed row cannot be restored with its ' +
      'id and relations intact.',
  })
  remove(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ): Promise<void> {
    return this.transactions.remove(profileId, transactionId);
  }

  @Post(':transactionId/restore')
  @RequireAction('transaction:edit')
  @ApiOperation({ summary: 'Undo a deletion' })
  restore(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactions.restore(profileId, transactionId);
  }
}
