import { Injectable, Logger } from '@nestjs/common';
import { SubmissionReviewJob } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParsedSuggestion } from '../claude-client/suggestion-parser';

/** Persists parsed suggestions as pending AiSuggestion rows. */
@Injectable()
export class ResultWriterService {
  private readonly logger = new Logger(ResultWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(
    job: SubmissionReviewJob,
    suggestions: ParsedSuggestion[],
    validTaskIds: string[],
  ): Promise<void> {
    if (suggestions.length === 0) {
      return;
    }
    const valid = new Set(validTaskIds);

    await this.prisma.aiSuggestion.createMany({
      data: suggestions.map((s) => ({
        projectId: job.projectId,
        taskId: job.taskId,
        // Guard against hallucinated ids — only tasks that were actually in
        // the prompt context may be referenced.
        relatedTaskIds: s.relatedTaskIds.filter((id) => valid.has(id)),
        triggeredBySubmissionId: job.submissionId,
        suggestionType: s.suggestionType,
        summary: s.summary,
        detail: s.detail,
      })),
    });
    this.logger.log(
      `Persisted ${suggestions.length} suggestion(s) for task ${job.taskId}`,
    );
  }
}
