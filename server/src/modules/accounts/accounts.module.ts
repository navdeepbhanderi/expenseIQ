import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { StatementGeneratorService } from './statement-generator.service';
import { AccountsService } from './accounts.service';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, StatementGeneratorService],
  exports: [AccountsService, StatementGeneratorService],
})
export class AccountsModule {}
