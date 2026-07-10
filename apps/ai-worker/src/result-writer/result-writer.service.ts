import { Injectable, Logger } from '@nestjs/common';
import { AiSuggestion } from '@prisma/client';
import { AiSuggestionDto, SubmissionReviewJob } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParsedSuggestion } from '../claude-client/suggestion-parser';

/**
 * Persists parsed suggestions as pending AiSuggestion rows and returns them
 * as DTOs so the caller can announce them (realtime + push).
 */
@Injectable()
export class ResultWriterService {
  private readonly logger = new Logger(ResultWriterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(
    job: SubmissionReviewJob,
    suggestions: ParsedSuggestion[],
    validTaskIds: string[],
  ): Promise<AiSuggestionDto[]> {
    if (suggestions.length === 0) {
      return [];
    }
    const valid = new Set(validTaskIds);

    const created = await this.prisma.aiSuggestion.createManyAndReturn({
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
      `Persisted ${created.length} suggestion(s) for task ${job.taskId}`,
    );
    return created.map((row) => this.toDto(row));
  }

  private toDto(row: AiSuggestion): AiSuggestionDto {
    return {
      id: row.id,
      projectId: row.projectId,
      taskId: row.taskId,
      relatedTaskIds: row.relatedTaskIds,
      triggeredBySubmissionId: row.triggeredBySubmissionId,
      suggestionType: row.suggestionType,
      summary: row.summary,
      detail: row.detail,
      status: row.status,
      reviewedById: null,
      reviewedAt: null,
      createdAt: row.createdAt.toISOString(),
      reviewedBy: null,
    };
  }
}
