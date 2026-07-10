import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  SUBMISSION_REVIEW_QUEUE,
  SubmissionReviewJob,
  parseRedisUrl,
} from '@construct/shared';

/** How long to keep batching new submissions for a task into one AI review. */
const DEFAULT_DEBOUNCE_MS = 2 * 60 * 1000;

/**
 * Producer side of the submission-review queue.
 *
 * Enqueueing is fire-and-forget from the caller's perspective: a Redis outage
 * must never slow down or fail a submission upload, so `enqueue` swallows and
 * logs every failure instead of throwing. (A missed review is recoverable;
 * losing field evidence over a queue blip is not.)
 *
 * Debounce/batching: jobs are deduplicated per task per debounce window via a
 * time-bucketed BullMQ jobId and delivered with `delay`, so a burst of photo
 * uploads on one task becomes a single AI review instead of one per photo.
 * The bucket key means a burst spanning a bucket boundary can still produce
 * two jobs — acceptable for v1; smarter sliding-window batching is a noted
 * future improvement.
 */
@Injectable()
export class SubmissionReviewQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(SubmissionReviewQueueService.name);
  private readonly debounceMs: number;
  private queue: Queue | null = null;
  // Owned (not left to BullMQ) so shutdown can force-disconnect even while
  // ioredis is mid-reconnect — BullMQ's own close()/disconnect() await a
  // connection that may never come.
  private connection: IORedis | null = null;

  constructor(private readonly config: ConfigService) {
    this.debounceMs = Number(
      this.config.get<string>('SUBMISSION_REVIEW_DEBOUNCE_MS') ?? DEFAULT_DEBOUNCE_MS,
    );
  }

  async enqueueSubmissionReview(job: SubmissionReviewJob): Promise<void> {
    const bucket = Math.floor(Date.now() / this.debounceMs);
    try {
      // Bounded so a Redis that is down (but still "connecting") can't keep a
      // pending promise alive forever.
      await this.withTimeout(
        this.getQueue().add('review', job, {
          // One job per task per debounce window; duplicate adds are no-ops.
          jobId: `task-${job.taskId}-${bucket}`,
          delay: this.debounceMs,
          removeOnComplete: true,
          removeOnFail: 100,
        }),
        5000,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue submission review for task ${job.taskId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.queue) {
      return;
    }
    await this.withTimeout(this.queue.close(), 2000).catch(() => undefined);
    // Synchronous, works in any connection state — kills reconnect timers.
    this.connection?.disconnect();
  }

  /** Lazy so importing the module (e.g. in tests) never dials Redis. */
  private getQueue(): Queue {
    if (!this.queue) {
      this.connection = new IORedis({
        ...parseRedisUrl(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
        // Fail fast instead of buffering commands while disconnected —
        // enqueue() logs and moves on.
        enableOfflineQueue: false,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => Math.min(times * 1000, 15000),
      });
      // ioredis emits 'error' on connection failure; without a listener that
      // crashes the process.
      this.connection.on('error', (error) =>
        this.logger.warn(`Redis connection error: ${error.message}`),
      );
      this.queue = new Queue(SUBMISSION_REVIEW_QUEUE, { connection: this.connection });
    }
    return this.queue;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }
}
