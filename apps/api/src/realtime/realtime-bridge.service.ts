import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { REALTIME_CHANNEL, RealtimeBridgeMessage, parseRedisUrl } from '@construct/shared';
import { RealtimeService } from './realtime.service';

/**
 * Subscribes to the Redis pub/sub channel that apps/ai-worker publishes on
 * (the worker is a separate process and can't reach the Socket.IO server
 * directly) and re-broadcasts to project rooms via RealtimeService.
 *
 * Redis being down degrades to "no live suggestion events" — it never breaks
 * the API. The connection retries in the background and force-disconnects on
 * shutdown.
 */
@Injectable()
export class RealtimeBridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBridgeService.name);
  private subscriber: IORedis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    this.subscriber = new IORedis({
      ...parseRedisUrl(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 1000, 15000),
    });
    this.subscriber.on('error', (error) =>
      this.logger.warn(`Redis subscriber error: ${error.message}`),
    );
    this.subscriber.subscribe(REALTIME_CHANNEL).catch((error) =>
      this.logger.warn(`Could not subscribe to ${REALTIME_CHANNEL}: ${error.message}`),
    );
    this.subscriber.on('message', (_channel, raw) => void this.handleMessage(raw));
  }

  onModuleDestroy(): void {
    // Synchronous force-disconnect — works in any connection state.
    this.subscriber?.disconnect();
  }

  private async handleMessage(raw: string): Promise<void> {
    let message: RealtimeBridgeMessage;
    try {
      message = JSON.parse(raw) as RealtimeBridgeMessage;
    } catch {
      this.logger.warn(`Dropping malformed bridge message: ${raw.slice(0, 200)}`);
      return;
    }

    if (message.event === 'suggestion:created') {
      await this.realtime.emitSuggestionCreated(message.projectId, message.suggestion);
    } else {
      this.logger.warn(`Unknown bridge event: ${(message as { event: string }).event}`);
    }
  }
}
