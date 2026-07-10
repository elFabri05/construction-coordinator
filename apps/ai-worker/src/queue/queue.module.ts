import { Module } from '@nestjs/common';
import { PromptBuilderModule } from '../prompt-builder/prompt-builder.module';
import { ClaudeClientModule } from '../claude-client/claude-client.module';
import { ResultWriterModule } from '../result-writer/result-writer.module';
import { OutboundModule } from '../outbound/outbound.module';
import { SubmissionReviewWorker } from './submission-review.worker';

@Module({
  imports: [PromptBuilderModule, ClaudeClientModule, ResultWriterModule, OutboundModule],
  providers: [SubmissionReviewWorker],
})
export class QueueModule {}
