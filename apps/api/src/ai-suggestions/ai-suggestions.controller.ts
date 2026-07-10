import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AiSuggestionDto } from '@construct/shared';
import { AiSuggestionsService } from './ai-suggestions.service';
import { ReviewSuggestionDto } from './dto/review-suggestion.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

// The AI review queue is a management surface: members never see it in this
// phase (may open up later). Owner and superuser behave identically, matching
// the phase-2 convention.
@Controller('projects/:id/suggestions')
export class AiSuggestionsController {
  constructor(private readonly suggestions: AiSuggestionsService) {}

  @Get()
  @RequireRole('owner', 'superuser')
  list(
    @Param('id') projectId: string,
    @Query('status') status?: string,
  ): Promise<AiSuggestionDto[]> {
    return this.suggestions.list(projectId, status);
  }

  @Patch(':suggestionId')
  @RequireRole('owner', 'superuser')
  review(
    @Param('id') projectId: string,
    @Param('suggestionId') suggestionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewSuggestionDto,
  ): Promise<AiSuggestionDto> {
    return this.suggestions.review(projectId, suggestionId, dto.status, user.id);
  }
}
