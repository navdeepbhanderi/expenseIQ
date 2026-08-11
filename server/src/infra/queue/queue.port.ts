/**
 * Background work, behind a seam.
 *
 * The plan reserves queues for ingestion - Gmail, receipts, reminders - where
 * nobody is waiting on screen. Interactive parsing stays synchronous.
 *
 * Two drivers, same contract:
 *
 *   bull   - BullMQ on Redis. Survives a restart, retries, and can be worked
 *            by a separate process later.
 *   inline - runs the handler immediately, in-process. Used by integration
 *            tests, because a test that enqueues work and then polls for a
 *            worker to pick it up is slow and flaky, and it would be testing
 *            BullMQ rather than this application.
 */

export const QUEUE_PORT = Symbol('QUEUE_PORT');

export const QUEUES = {
  receiptParse: 'receipt-parse',
  recurrenceScan: 'recurrence-scan',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export type JobHandler<T = unknown> = (payload: T) => Promise<void>;

export interface QueuePort {
  readonly name: string;

  /**
   * Registers the worker for a queue. Called once at module init.
   *
   * Registration is separate from enqueueing so the inline driver has
   * somewhere to dispatch to, and so the Bull driver can later be started in
   * a worker process that registers handlers without serving HTTP.
   */
  register<T>(queue: QueueName, handler: JobHandler<T>): void;

  /**
   * Schedules work.
   *
   * Resolves when the job is *accepted*, not when it completes - except on
   * the inline driver, where those are the same moment. Callers must not
   * depend on completion; that is what the job's own status field is for.
   */
  enqueue<T>(queue: QueueName, payload: T): Promise<void>;

  /** Waits for outstanding work. Test-only; a no-op on the Bull driver. */
  drain(): Promise<void>;
}
