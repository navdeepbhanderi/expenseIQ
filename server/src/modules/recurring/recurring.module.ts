import { Module } from '@nestjs/common';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';
import { RecurrenceGeneratorService } from './recurrence-generator.service';

@Module({
  controllers: [RecurringController],
  providers: [RecurringService, RecurrenceGeneratorService],
  exports: [RecurringService, RecurrenceGeneratorService],
})
export class RecurringModule {}
