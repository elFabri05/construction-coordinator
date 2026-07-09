import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TaskDto } from '@construct/shared';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { ReorderTasksDto } from './dto/reorder-tasks.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('projects/:id/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequireRole()
  list(
    @Param('id') projectId: string,
    @Query() query: ListTasksQueryDto,
  ): Promise<TaskDto[]> {
    return this.tasks.list(projectId, query.status);
  }

  @Post()
  @RequireRole('owner', 'superuser')
  create(
    @Param('id') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskDto> {
    return this.tasks.create(projectId, user.id, dto);
  }

  // Declared before the :taskId routes so PATCH .../tasks/reorder does not
  // get captured by PATCH .../tasks/:taskId.
  @Patch('reorder')
  @RequireRole('owner', 'superuser')
  reorder(
    @Param('id') projectId: string,
    @Body() dto: ReorderTasksDto,
  ): Promise<TaskDto[]> {
    return this.tasks.reorder(projectId, dto.taskIds);
  }

  @Get(':taskId')
  @RequireRole()
  detail(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskDto> {
    return this.tasks.get(projectId, taskId);
  }

  @Patch(':taskId')
  @RequireRole('owner', 'superuser')
  update(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskDto> {
    return this.tasks.update(projectId, taskId, dto);
  }

  // Deliberately narrow: any active member may call it, and the DTO accepts
  // ONLY { status } (the global forbidNonWhitelisted pipe rejects anything
  // else), so a member can't smuggle a title change through this route.
  @Patch(':taskId/status')
  @RequireRole()
  updateStatus(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ): Promise<TaskDto> {
    return this.tasks.updateStatus(projectId, taskId, dto.status);
  }

  @Delete(':taskId')
  @RequireRole('owner', 'superuser')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<void> {
    return this.tasks.delete(projectId, taskId);
  }
}
