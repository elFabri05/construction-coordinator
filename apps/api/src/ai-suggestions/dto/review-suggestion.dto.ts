import { IsIn } from 'class-validator';
import {
  AI_SUGGESTION_REVIEW_STATUSES,
  AiSuggestionReviewStatus,
  ReviewAiSuggestionRequest,
} from '@construct/shared';

export class ReviewSuggestionDto implements ReviewAiSuggestionRequest {
  @IsIn(AI_SUGGESTION_REVIEW_STATUSES)
  status!: AiSuggestionReviewStatus;
}
