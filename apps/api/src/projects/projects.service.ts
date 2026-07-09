import { Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { ProjectDto, ProjectWithRoleDto } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the project and the creator's `owner` membership atomically
   * (Prisma nested create runs in a single transaction).
   */
  async create(ownerId: string, dto: CreateProjectDto): Promise<ProjectDto> {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        goal: dto.goal,
        ownerId,
        memberships: {
          create: { userId: ownerId, role: 'owner', status: 'active' },
        },
      },
    });
    return this.toDto(project);
  }

  /** Projects where the caller has an active membership, with their role. */
  async listForUser(userId: string): Promise<ProjectWithRoleDto[]> {
    const projects = await this.prisma.project.findMany({
      where: { memberships: { some: { userId, status: 'active' } } },
      include: {
        memberships: { where: { userId }, select: { role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects.map(({ memberships, ...project }) => ({
      ...this.toDto(project),
      myRole: memberships[0].role,
    }));
  }

  async getById(id: string): Promise<ProjectDto> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.toDto(project);
  }

  private toDto(project: Project): ProjectDto {
    return {
      id: project.id,
      name: project.name,
      goal: project.goal,
      ownerId: project.ownerId,
      createdAt: project.createdAt.toISOString(),
    };
  }
}
