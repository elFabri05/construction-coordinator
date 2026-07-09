import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { TaskDto, TaskStatus } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, status?: TaskStatus): Promise<TaskDto[]> {
    const tasks = await this.prisma.task.findMany({
      where: { projectId, ...(status ? { status } : {}) },
      orderBy: { sequenceOrder: 'asc' },
    });
    return tasks.map((t) => this.toDto(t));
  }

  async get(projectId: string, taskId: string): Promise<TaskDto> {
    return this.toDto(await this.findInProject(projectId, taskId));
  }

  async create(
    projectId: string,
    createdById: string,
    dto: CreateTaskDto,
  ): Promise<TaskDto> {
    // Max+1 inside a transaction so concurrent creates can't collide.
    const task = await this.prisma.$transaction(async (tx) => {
      const max = await tx.task.aggregate({
        where: { projectId },
        _max: { sequenceOrder: true },
      });
      return tx.task.create({
        data: {
          projectId,
          title: dto.title,
          description: dto.description ?? '',
          sequenceOrder: (max._max.sequenceOrder ?? 0) + 1,
          createdById,
        },
      });
    });
    return this.toDto(task);
  }

  /** Owner/superuser edits: title/description/sequenceOrder (never status). */
  async update(
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskDto> {
    await this.findInProject(projectId, taskId);
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.sequenceOrder !== undefined ? { sequenceOrder: dto.sequenceOrder } : {}),
      },
    });
    return this.toDto(task);
  }

  /**
   * The one write available to the `member` role. Transitions are
   * deliberately unrestricted (any status -> any status) for now; tightening
   * them is a possible later refinement.
   */
  async updateStatus(
    projectId: string,
    taskId: string,
    status: TaskStatus,
  ): Promise<TaskDto> {
    await this.findInProject(projectId, taskId);
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { status },
    });
    return this.toDto(task);
  }

  /**
   * Renumbers the given tasks to 1..n in one transaction: if any id does not
   * belong to this project, the whole reorder rolls back and nothing changes.
   * Clients send the complete task list of the project in its new order.
   */
  async reorder(projectId: string, taskIds: string[]): Promise<TaskDto[]> {
    if (new Set(taskIds).size !== taskIds.length) {
      throw new BadRequestException('taskIds contains duplicates');
    }

    try {
      await this.prisma.$transaction(
        taskIds.map((id, index) =>
          this.prisma.task.update({
            // projectId in the filter: a task from another project (or a
            // nonexistent id) throws P2025 and rolls back the transaction.
            where: { id, projectId },
            data: { sequenceOrder: index + 1 },
          }),
        ),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(
          'One or more tasks do not belong to this project',
        );
      }
      throw error;
    }

    return this.list(projectId);
  }

  async delete(projectId: string, taskId: string): Promise<void> {
    await this.findInProject(projectId, taskId);
    await this.prisma.task.delete({ where: { id: taskId } });
  }

  private async findInProject(projectId: string, taskId: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private toDto(task: Task): TaskDto {
    return {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      status: task.status,
      sequenceOrder: task.sequenceOrder,
      createdById: task.createdById,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
