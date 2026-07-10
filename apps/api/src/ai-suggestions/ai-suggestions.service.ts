import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiSuggestion, User } from '@prisma/client';
import {
  AI_SUGGESTION_STATUSES,
  AiSuggestionDto,
  AiSuggestionReviewStatus,
  AiSuggestionStatus,
} from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';

type SuggestionWithReviewer = AiSuggestion & {
  reviewedBy: Pick<User, 'id' | 'email' | 'name'> | null;
};

const reviewerInclude = {
  reviewedBy: { select: { id: true, email: true, name: true } },
} as const;

@Injectable()
export class AiSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest-first; optionally filtered by status (`?status=pending`). */
  async list(projectId: string, status?: string): Promise<AiSuggestionDto[]> {
    if (status !== undefined && !this.isStatus(status)) {
      throw new BadRequestException(
        `status must be one of: ${AI_SUGGESTION_STATUSES.join(', ')}`,
      );
    }

    const suggestions = await this.prisma.aiSuggestion.findMany({
      where: { projectId, ...(status ? { status } : {}) },
      include: reviewerInclude,
      orderBy: { createdAt: 'desc' },
    });
    return suggestions.map((s) => this.toDto(s));
  }

  /**
   * Records the human decision. Accepting does NOT apply any change to tasks
   * or guidelines — auto-apply is deliberately out of scope in this phase.
   * A decision is final: re-reviewing a reviewed suggestion is a 409, which
   * keeps the accept/dismiss history trustworthy as an audit record.
   */
  async review(
    projectId: string,
    suggestionId: string,
    status: AiSuggestionReviewStatus,
    reviewerId: string,
  ): Promise<AiSuggestionDto> {
    const suggestion = await this.prisma.aiSuggestion.findFirst({
      where: { id: suggestionId, projectId },
      select: { id: true, status: true },
    });
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }
    if (suggestion.status !== 'pending') {
      throw new ConflictException(`Suggestion has already been ${suggestion.status}`);
    }

    const updated = await this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { status, reviewedById: reviewerId, reviewedAt: new Date() },
      include: reviewerInclude,
    });
    return this.toDto(updated);
  }

  private isStatus(value: string): value is AiSuggestionStatus {
    return (AI_SUGGESTION_STATUSES as readonly string[]).includes(value);
  }

  private toDto(s: SuggestionWithReviewer): AiSuggestionDto {
    return {
      id: s.id,
      projectId: s.projectId,
      taskId: s.taskId,
      relatedTaskIds: s.relatedTaskIds,
      triggeredBySubmissionId: s.triggeredBySubmissionId,
      suggestionType: s.suggestionType,
      summary: s.summary,
      detail: s.detail,
      status: s.status,
      reviewedById: s.reviewedById,
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      reviewedBy: s.reviewedBy,
    };
  }
}
