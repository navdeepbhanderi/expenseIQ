import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/logger/app-logger.service';
import type { JobHandler, QueueName, QueuePort } from './queue.port';

/**
 * Runs jobs immediately, in-process.
 *
 * The default when Redis isn't configured, and what integration tests use.
 * A test that enqueues work and then polls for a worker to pick it up is slow
 * and flaky, and it ends up testing BullMQ rather than this application.
 *
 * Jobs are still awaited through the same `enqueue` contract, so switching
 * drivers changes timing but never call shape.
 */
@Injectable()
export class InlineQueueAdapter implements QueuePort {
  readonly name = 'inline';

  private readonly handlers = new Map<QueueName, JobHandler<never>>();
  private pending: Promise<unknown>[] = [];

  constructor(private readonly logger: AppLogger) {
    this.logger.setContext('InlineQueue');
  }

  register<T>(queue: QueueName, handler: JobHandler<T>): void {
    this.handlers.set(queue, handler);
  }

  async enqueue<T>(queue: QueueName, payload: T): Promise<void> {
    const handler = this.handlers.get(queue);

    if (!handler) {
      this.logger.warn('No handler registered for queue', { queue });
      return;
    }

    // Tracked so drain() can await it. A job that throws must not become an
    // unhandled rejection and take the process down - the caller has already
    // been told the work was accepted.
    const run = (handler as JobHandler<T>)(payload).catch((error: unknown) => {
      this.logger.error('Inline job failed', undefined, {
        queue,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    this.pending.push(run);
    await run;
  }

  async drain(): Promise<void> {
    const outstanding = this.pending;
    this.pending = [];
    await Promise.all(outstanding);
  }
}
