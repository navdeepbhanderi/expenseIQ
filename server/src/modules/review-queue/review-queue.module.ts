import { Module } from '@nestjs/common';
import { MerchantsModule } from '@/modules/merchants/merchants.module';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewQueueService } from './review-queue.service';

@Module({
  imports: [MerchantsModule],
  controllers: [ReviewQueueController],
  providers: [ReviewQueueService],
  exports: [ReviewQueueService],
})
export class ReviewQueueModule {}
