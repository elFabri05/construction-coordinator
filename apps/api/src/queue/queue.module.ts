import { Module } from '@nestjs/common';
import { SubmissionReviewQueueService } from './submission-review-queue.service';

@Module({
  providers: [SubmissionReviewQueueService],
  exports: [SubmissionReviewQueueService],
})
export class QueueModule {}
