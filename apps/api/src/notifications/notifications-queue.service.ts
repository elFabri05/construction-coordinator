import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { NOTIFICATIONS_QUEUE, NotificationJobData, parseRedisUrl } from '@construct/shared';

/**
 * Producer for the notifications queue (invite emails + push notifications).
 * Same contract as the submission-review producer: fire-and-forget, lazy
 * connection, never throws — a flaky Redis or push provider must never slow
 * down or fail the API action that triggered the notification.
 */
@Injectable()
export class NotificationsQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsQueueService.name);
  private queue: Queue | null = null;
  private connection: IORedis | null = null;

  constructor(private readonly config: ConfigService) {}

  async enqueue(job: NotificationJobData): Promise<void> {
    try {
      await this.withTimeout(
        this.getQueue().add(job.kind, job, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
        }),
        5000,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue ${job.kind} notification: ${
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
    this.connection?.disconnect();
  }

  private getQueue(): Queue {
    if (!this.queue) {
      this.connection = new IORedis({
        ...parseRedisUrl(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
        enableOfflineQueue: false,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => Math.min(times * 1000, 15000),
      });
      this.connection.on('error', (error) =>
        this.logger.warn(`Redis connection error: ${error.message}`),
      );
      this.queue = new Queue(NOTIFICATIONS_QUEUE, { connection: this.connection });
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
