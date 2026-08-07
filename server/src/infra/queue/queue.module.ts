import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppLogger } from '@/common/logger/app-logger.service';
import { QUEUE_PORT, type QueuePort } from './queue.port';
import { BullQueueAdapter } from './bull-queue.adapter';
import { InlineQueueAdapter } from './inline-queue.adapter';

/**
 * `QUEUE_DRIVER=inline` runs jobs in-process; anything else uses BullMQ.
 *
 * Inline is the default in test, because an integration test should assert
 * what this application does with a parsed receipt, not whether BullMQ
 * delivers a message.
 */
@Global()
@Module({
  providers: [
    BullQueueAdapter,
    InlineQueueAdapter,
    {
      provide: QUEUE_PORT,
      inject: [ConfigService, BullQueueAdapter, InlineQueueAdapter, AppLogger],
      useFactory: (
        config: ConfigService,
        bull: BullQueueAdapter,
        inline: InlineQueueAdapter,
        logger: AppLogger,
      ): QueuePort => {
        logger.setContext('QueueModule');

        const driver =
          process.env.QUEUE_DRIVER ??
          (config.get<boolean>('isTest') ? 'inline' : 'bull');

        if (driver === 'inline') {
          logger.warn(
            'Background jobs run inline — not durable across restarts',
          );
          return inline;
        }

        return bull;
      },
    },
  ],
  exports: [QUEUE_PORT],
})
export class QueueModule {}
