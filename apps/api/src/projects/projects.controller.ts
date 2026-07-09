import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ProjectDto, ProjectWithRoleDto } from '@construct/shared';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectDto> {
    return this.projects.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthenticatedUser): Promise<ProjectWithRoleDto[]> {
    return this.projects.listForUser(user.id);
  }

  // Any active membership grants read access; non-members get 403.
  @Get(':id')
  @RequireRole()
  detail(@Param('id') id: string): Promise<ProjectDto> {
    return this.projects.getById(id);
  }
}
