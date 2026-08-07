import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { NluModule } from '@/modules/nlu/nlu.module';
import { StorageService } from '@/infra/storage/storage.service';
import { QUEUE_PORT, QUEUES, type QueuePort } from '@/infra/queue/queue.port';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [NluModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, StorageService],
  exports: [ReceiptsService],
})
export class ReceiptsModule implements OnModuleInit {
  constructor(
    @Inject(QUEUE_PORT) private readonly queue: QueuePort,
    private readonly receipts: ReceiptsService,
  ) {}

  /**
   * Registers the worker here rather than in the service, so the service has
   * no idea whether it is being driven by BullMQ or run inline.
   */
  onModuleInit(): void {
    this.queue.register<{ receiptId: string }>(
      QUEUES.receiptParse,
      ({ receiptId }) => this.receipts.parseStoredReceipt(receiptId),
    );
  }
}
