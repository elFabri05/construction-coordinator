import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import {
  SUBMISSION_REVIEW_QUEUE,
  SubmissionReviewJob,
  parseRedisUrl,
} from '@construct/shared';
import { PromptBuilderService } from '../prompt-builder/prompt-builder.service';
import { ClaudeClientService } from '../claude-client/claude-client.service';
import { ResultWriterService } from '../result-writer/result-writer.service';
import { OutboundService } from '../outbound/outbound.service';

/**
 * Consumes the submission-review queue. Batching happened on the producer
 * side (jobs are debounced/deduplicated per task per window), so by the time
 * a job arrives here, one job == one AI review of a task's recent submission
 * history — the prompt builder re-reads that history at processing time, so
 * every submission that landed during the debounce window is included.
 */
@Injectable()
export class SubmissionReviewWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubmissionReviewWorker.name);
  private worker: Worker<SubmissionReviewJob> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly claude: ClaudeClientService,
    private readonly resultWriter: ResultWriterService,
    private readonly outbound: OutboundService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<SubmissionReviewJob>(
      SUBMISSION_REVIEW_QUEUE,
      (job) => this.process(job),
      {
        connection: {
          ...parseRedisUrl(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
          // Required by BullMQ workers (blocking commands must not be retried).
          maxRetriesPerRequest: null,
        },
        concurrency: Number(this.config.get<string>('WORKER_CONCURRENCY') ?? 2),
      },
    );
    this.worker.on('error', (error) =>
      this.logger.error(`Queue connection error: ${error.message}`),
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(
        `Review job ${job?.id ?? '?'} failed: ${error.message}`,
        error.stack,
      ),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<SubmissionReviewJob>): Promise<void> {
    this.logger.log(`Reviewing task ${job.data.taskId} (job ${job.id})`);

    const context = await this.promptBuilder.build(job.data);
    if (!context) {
      return; // task vanished — nothing to review
    }

    const suggestions = await this.claude.review(context);
    if (suggestions.length === 0) {
      this.logger.log(`Task ${job.data.taskId}: nothing worth flagging`);
      return;
    }

    const created = await this.resultWriter.write(
      job.data,
      suggestions,
      context.validTaskIds,
    );
    // Realtime event (via the api's Redis bridge) + push jobs. Fire-and-
    // forget inside: the suggestions are already persisted either way.
    await this.outbound.announceSuggestions(created);
  }
}
