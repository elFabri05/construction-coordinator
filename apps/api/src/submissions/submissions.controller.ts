import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Membership } from '@prisma/client';
import { SubmissionDto, UploadUrlDto } from '@construct/shared';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { CurrentMembership } from '../common/decorators/current-membership.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

// Every route is open to any ACTIVE member of the project — field teams of
// all roles submit evidence. There is deliberately no PATCH/PUT here:
// submissions are immutable (corrections are new submissions).
@Controller('projects/:id/tasks/:taskId/submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post('upload-url')
  @RequireRole()
  @HttpCode(HttpStatus.OK)
  requestUploadUrl(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: RequestUploadUrlDto,
  ): Promise<UploadUrlDto> {
    return this.submissions.requestUploadUrl(projectId, taskId, dto.contentType);
  }

  @Post()
  @RequireRole()
  create(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSubmissionDto,
  ): Promise<SubmissionDto> {
    return this.submissions.create(projectId, taskId, user.id, dto);
  }

  @Get()
  @RequireRole()
  list(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<SubmissionDto[]> {
    return this.submissions.list(projectId, taskId);
  }

  // Author-or-manager check happens in the service (it needs the row);
  // the guard supplies the caller's membership role.
  @Delete(':submissionId')
  @RequireRole()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentMembership() membership: Membership,
  ): Promise<void> {
    return this.submissions.softDelete(projectId, taskId, submissionId, {
      userId: user.id,
      role: membership.role,
    });
  }
}
