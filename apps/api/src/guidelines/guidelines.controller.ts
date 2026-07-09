import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { GuidelineDto } from '@construct/shared';
import { GuidelinesService } from './guidelines.service';
import { UpsertGuidelineDto } from './dto/upsert-guideline.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('projects/:id/guideline')
export class GuidelinesController {
  constructor(private readonly guidelines: GuidelinesService) {}

  @Get()
  @RequireRole()
  get(@Param('id') projectId: string): Promise<GuidelineDto> {
    return this.guidelines.get(projectId);
  }

  @Put()
  @RequireRole('owner', 'superuser')
  upsert(
    @Param('id') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertGuidelineDto,
  ): Promise<GuidelineDto> {
    return this.guidelines.upsert(projectId, user.id, dto.content);
  }
}
