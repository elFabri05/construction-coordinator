import { Module } from '@nestjs/common';
import { PromptBuilderModule } from '../prompt-builder/prompt-builder.module';
import { ClaudeClientModule } from '../claude-client/claude-client.module';
import { ResultWriterModule } from '../result-writer/result-writer.module';
import { SubmissionReviewWorker } from './submission-review.worker';

@Module({
  imports: [PromptBuilderModule, ClaudeClientModule, ResultWriterModule],
  providers: [SubmissionReviewWorker],
})
export class QueueModule {}
