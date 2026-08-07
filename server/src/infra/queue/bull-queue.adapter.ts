import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';

import { AppLogger } from '@/common/logger/app-logger.service';
import type { AppConfig } from '@/config/configuration';
import type { JobHandler, QueueName, QueuePort } from './queue.port';

/**
 * BullMQ on Redis.
 *
 * Jobs survive a restart, retry with backoff, and can later be worked by a
 * separate process — which is the whole reason ingestion is queued rather
 * than done in the request.
 */
@Injectable()
export class BullQueueAdapter implements QueuePort, OnModuleDestroy {
  readonly name = 'bull';

  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext('BullQueue');
  }

  register<T>(queue: QueueName, handler: JobHandler<T>): void {
    const worker = new Worker(
      queue,
      async (job) => {
        await handler(job.data as T);
      },
      { connection: this.connection(), concurrency: 4 },
    );

    worker.on('failed', (job, error) => {
      this.logger.error('Job failed', undefined, {
        queue,
        jobId: job?.id,
        attempts: job?.attemptsMade,
        error: error.message,
      });
    });

    this.workers.push(worker);
  }

  async enqueue<T>(queue: QueueName, payload: T): Promise<void> {
    await this.queueFor(queue).add(queue, payload, {
      // Exponential backoff: a parse that failed on a rate limit should not
      // hammer the same limit three times in as many seconds.
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    });
  }

  /** No-op: with a real queue, completion is observed through job state. */
  drain(): Promise<void> {
    return Promise.resolve();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  private queueFor(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, { connection: this.connection() });
    this.queues.set(name, queue);
    return queue;
  }

  private connection(): ConnectionOptions {
    const url = this.config.get<AppConfig['redis']>('redis')?.url ?? '';
    const parsed = new URL(url);

    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      ...(parsed.password ? { password: parsed.password } : {}),
    };
  }
}
