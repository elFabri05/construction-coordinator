import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  AiSuggestionDto,
  NOTIFICATIONS_QUEUE,
  REALTIME_CHANNEL,
  SuggestionCreatedBridgeMessage,
  WS_EVENTS,
  parseRedisUrl,
} from '@construct/shared';

/**
 * The worker's outbound side effects for freshly persisted suggestions:
 *
 * - Redis pub/sub message on REALTIME_CHANNEL — the api's gateway picks it up
 *   and emits `suggestion:created` to owner/superuser sockets (the worker has
 *   no access to the Socket.IO server, so it can't emit directly).
 * - A `suggestion` job on the notifications queue — the api's processor
 *   pushes to owner/superuser devices (background/closed-app path).
 *
 * Both are fire-and-forget: a delivery hiccup never fails the review job —
 * the suggestion row is already safe in Postgres.
 */
@Injectable()
export class OutboundService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboundService.name);
  private connection: IORedis | null = null;
  private queue: Queue | null = null;

  constructor(private readonly config: ConfigService) {}

  async announceSuggestions(suggestions: AiSuggestionDto[]): Promise<void> {
    for (const suggestion of suggestions) {
      const message: SuggestionCreatedBridgeMessage = {
        event: WS_EVENTS.suggestionCreated,
        projectId: suggestion.projectId,
        suggestion,
      };
      try {
        await this.getConnection().publish(REALTIME_CHANNEL, JSON.stringify(message));
      } catch (error) {
        this.logger.warn(
          `Could not publish realtime event for suggestion ${suggestion.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
      try {
        await this.getQueue().add(
          'suggestion',
          {
            kind: 'suggestion',
            projectId: suggestion.projectId,
            suggestionId: suggestion.id,
            summary: suggestion.summary,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
      } catch (error) {
        this.logger.warn(
          `Could not enqueue push for suggestion ${suggestion.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
    this.connection?.disconnect();
  }

  private getConnection(): IORedis {
    if (!this.connection) {
      this.connection = new IORedis({
        ...parseRedisUrl(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
        enableOfflineQueue: false,
        maxRetriesPerRequest: null,
        retryStrategy: (times: number) => Math.min(times * 1000, 15000),
      });
      this.connection.on('error', (error) =>
        this.logger.warn(`Redis connection error: ${error.message}`),
      );
    }
    return this.connection;
  }

  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(NOTIFICATIONS_QUEUE, { connection: this.getConnection() });
    }
    return this.queue;
  }
}
