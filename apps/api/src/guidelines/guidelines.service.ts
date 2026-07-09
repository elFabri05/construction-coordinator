import { Injectable, NotFoundException } from '@nestjs/common';
import { Guideline, User } from '@prisma/client';
import { GuidelineDto } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';

type GuidelineWithUpdater = Guideline & {
  updatedBy: Pick<User, 'id' | 'email' | 'name'>;
};

const updaterInclude = {
  updatedBy: { select: { id: true, email: true, name: true } },
} as const;

@Injectable()
export class GuidelinesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(projectId: string): Promise<GuidelineDto> {
    const guideline = await this.prisma.guideline.findUnique({
      where: { projectId },
      include: updaterInclude,
    });
    if (!guideline) {
      throw new NotFoundException('This project has no guideline yet');
    }
    return this.toDto(guideline);
  }

  /**
   * One evolving guideline document per project, upserted in place.
   * Version history is a likely Phase 5+ feature — don't build it now, but
   * nothing here should preclude adding a history table alongside later.
   */
  async upsert(
    projectId: string,
    updatedById: string,
    content: string,
  ): Promise<GuidelineDto> {
    const guideline = await this.prisma.guideline.upsert({
      where: { projectId },
      create: { projectId, content, updatedById },
      update: { content, updatedById },
      include: updaterInclude,
    });
    return this.toDto(guideline);
  }

  private toDto(guideline: GuidelineWithUpdater): GuidelineDto {
    return {
      id: guideline.id,
      projectId: guideline.projectId,
      content: guideline.content,
      updatedById: guideline.updatedById,
      updatedAt: guideline.updatedAt.toISOString(),
      updatedBy: guideline.updatedBy,
    };
  }
}
