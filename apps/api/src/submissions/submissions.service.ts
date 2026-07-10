import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Submission, User } from '@prisma/client';
import {
  MembershipRole,
  SubmissionDto,
  UploadContentType,
  UploadUrlDto,
} from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SubmissionReviewQueueService } from '../queue/submission-review-queue.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';

type SubmissionWithUser = Submission & {
  user: Pick<User, 'id' | 'email' | 'name'>;
};

const userInclude = {
  user: { select: { id: true, email: true, name: true } },
} as const;

const EXTENSION_BY_CONTENT_TYPE: Record<UploadContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly reviewQueue: SubmissionReviewQueueService,
  ) {}

  async requestUploadUrl(
    projectId: string,
    taskId: string,
    contentType: UploadContentType = 'image/jpeg',
  ): Promise<UploadUrlDto> {
    await this.ensureTaskInProject(projectId, taskId);

    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    const objectKey = this.keyPrefix(projectId, taskId) + `${randomUUID()}.${extension}`;
    const uploadUrl = await this.storage.getPresignedUploadUrl(objectKey, contentType);
    return { uploadUrl, objectKey };
  }

  async create(
    projectId: string,
    taskId: string,
    userId: string,
    dto: CreateSubmissionDto,
  ): Promise<SubmissionDto> {
    await this.ensureTaskInProject(projectId, taskId);

    const comment = dto.comment?.trim() || null;
    // Belt-and-braces: the DTO already enforces this shape.
    if (!comment && !dto.photoKey) {
      throw new BadRequestException('Provide a comment, a photo, or both');
    }
    if (dto.thumbnailKey && !dto.photoKey) {
      throw new BadRequestException('thumbnailKey is only valid alongside photoKey');
    }

    // Keys must have been issued for THIS task — prevents referencing (and
    // thus exposing via signed read URLs) objects from other projects.
    const prefix = this.keyPrefix(projectId, taskId);
    for (const key of [dto.photoKey, dto.thumbnailKey]) {
      if (key && !key.startsWith(prefix)) {
        throw new BadRequestException('Object key does not belong to this task');
      }
    }

    const submission = await this.prisma.submission.create({
      data: {
        projectId,
        taskId,
        userId,
        comment,
        photoKey: dto.photoKey ?? null,
        thumbnailKey: dto.thumbnailKey ?? null,
      },
      include: userInclude,
    });

    // Fire-and-forget: the AI review job must never delay or fail the upload
    // response. enqueueSubmissionReview logs failures internally.
    void this.reviewQueue.enqueueSubmissionReview({
      submissionId: submission.id,
      taskId,
      projectId,
    });

    return this.toDto(submission);
  }

  /** Newest-first, soft-deleted rows excluded, signed read URLs resolved. */
  async list(projectId: string, taskId: string): Promise<SubmissionDto[]> {
    await this.ensureTaskInProject(projectId, taskId);

    const submissions = await this.prisma.submission.findMany({
      where: { taskId, deletedAt: null },
      include: userInclude,
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(submissions.map((s) => this.toDto(s)));
  }

  /**
   * Soft delete only — the row (and object) may be referenced by AI
   * suggestion history in later phases. Submissions are otherwise immutable:
   * there is deliberately no update path; corrections are new submissions.
   */
  async softDelete(
    projectId: string,
    taskId: string,
    submissionId: string,
    caller: { userId: string; role: MembershipRole },
  ): Promise<void> {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, taskId, projectId, deletedAt: null },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const isAuthor = submission.userId === caller.userId;
    const isManager = caller.role === 'owner' || caller.role === 'superuser';
    if (!isAuthor && !isManager) {
      throw new ForbiddenException(
        'Only the author or an owner/superuser can delete a submission',
      );
    }

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { deletedAt: new Date() },
    });
  }

  private keyPrefix(projectId: string, taskId: string): string {
    return `projects/${projectId}/tasks/${taskId}/`;
  }

  private async ensureTaskInProject(projectId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
  }

  private async toDto(submission: SubmissionWithUser): Promise<SubmissionDto> {
    const [photoUrl, thumbnailUrl] = await Promise.all([
      submission.photoKey
        ? this.storage.getPresignedReadUrl(submission.photoKey)
        : Promise.resolve(null),
      submission.thumbnailKey
        ? this.storage.getPresignedReadUrl(submission.thumbnailKey)
        : Promise.resolve(null),
    ]);

    return {
      id: submission.id,
      taskId: submission.taskId,
      projectId: submission.projectId,
      userId: submission.userId,
      comment: submission.comment,
      photoUrl,
      thumbnailUrl,
      createdAt: submission.createdAt.toISOString(),
      user: submission.user,
    };
  }
}
