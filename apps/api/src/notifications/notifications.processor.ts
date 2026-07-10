import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  InviteNotificationJob,
  NOTIFICATIONS_QUEUE,
  NotificationJobData,
  SubmissionNotificationJob,
  SuggestionNotificationJob,
  TaskBlockedNotificationJob,
  parseRedisUrl,
} from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ExpoPushService } from './expo-push.service';

/**
 * Consumes the notifications queue in-process. Recipients are re-derived
 * from the DB at processing time (not enqueue time), so role filtering —
 * e.g. suggestions only to owner/superuser — reflects the memberships as
 * they are when the push actually goes out.
 *
 * Redis being unreachable degrades to "no notifications" (the connection
 * retries in the background); it never affects request handling.
 */
@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker: Worker<NotificationJobData> | null = null;
  // Owned so shutdown can force-disconnect even mid-reconnect (BullMQ's own
  // close awaits a connection that may never come when Redis is down).
  private connection: IORedis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly push: ExpoPushService,
  ) {}

  onModuleInit(): void {
    this.connection = new IORedis({
      ...parseRedisUrl(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 1000, 15000),
    });
    this.connection.on('error', (error) =>
      this.logger.warn(`Redis connection error: ${error.message}`),
    );

    this.worker = new Worker<NotificationJobData>(
      NOTIFICATIONS_QUEUE,
      (job) => this.process(job),
      { connection: this.connection, concurrency: 5 },
    );
    this.worker.on('error', (error) =>
      this.logger.warn(`Notifications queue connection error: ${error.message}`),
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Notification job ${job?.id ?? '?'} failed: ${error.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    // force=true: don't wait for an unreachable Redis; then hard-kill the
    // connection so no reconnect timer can outlive the app.
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.worker?.close(true).catch(() => undefined),
      new Promise((resolve) => {
        timer = setTimeout(resolve, 2000);
      }),
    ]).finally(() => clearTimeout(timer));
    this.connection?.disconnect();
  }

  private async process(job: Job<NotificationJobData>): Promise<void> {
    const data = job.data;
    switch (data.kind) {
      case 'invite':
        return this.processInvite(data);
      case 'suggestion':
        return this.processSuggestion(data);
      case 'task-blocked':
        return this.processTaskBlocked(data);
      case 'submission':
        return this.processSubmission(data);
    }
  }

  private async processInvite(data: InviteNotificationJob): Promise<void> {
    const [project, inviter, invitee] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: data.projectId } }),
      this.prisma.user.findUnique({ where: { id: data.inviterId } }),
      this.prisma.user.findUnique({ where: { id: data.invitedUserId } }),
    ]);
    if (!project || !inviter) {
      return; // deleted in the meantime — nothing sensible to send
    }

    const baseUrl = this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:3000';
    const inviteLink = `${baseUrl}/invite?project=${encodeURIComponent(
      project.id,
    )}&name=${encodeURIComponent(project.name)}`;

    await this.email.sendInviteEmail(data.email, project.name, inviter.name, inviteLink);

    // Push only reaches users who already have the app (registered a device
    // token) — the email covers everyone else.
    if (invitee) {
      await this.push.sendToUsers([invitee.id], {
        title: 'New project invitation',
        body: `${inviter.name} invited you to "${project.name}"`,
        data: { type: 'invite', projectId: project.id, projectName: project.name },
      });
    }
  }

  private async processSuggestion(data: SuggestionNotificationJob): Promise<void> {
    // Role filter at send time — members never get suggestion pushes.
    const managers = await this.prisma.membership.findMany({
      where: {
        projectId: data.projectId,
        status: 'active',
        role: { in: ['owner', 'superuser'] },
      },
      select: { userId: true },
    });
    await this.push.sendToUsers(
      managers.map((m) => m.userId),
      {
        title: 'New AI suggestion',
        body: data.summary,
        data: { type: 'suggestion', projectId: data.projectId },
      },
    );
  }

  private async processTaskBlocked(data: TaskBlockedNotificationJob): Promise<void> {
    // Default per spec: all active project members (may be narrowed later).
    const members = await this.prisma.membership.findMany({
      where: { projectId: data.projectId, status: 'active' },
      select: { userId: true },
    });
    await this.push.sendToUsers(
      members.map((m) => m.userId),
      {
        title: 'Task blocked',
        body: `"${data.taskTitle}" was marked as blocked`,
        data: { type: 'task-blocked', projectId: data.projectId, taskId: data.taskId },
      },
    );
  }

  private async processSubmission(data: SubmissionNotificationJob): Promise<void> {
    const [submission, members] = await Promise.all([
      this.prisma.submission.findUnique({
        where: { id: data.submissionId },
        include: { user: { select: { name: true } }, task: { select: { title: true } } },
      }),
      this.prisma.membership.findMany({
        where: { projectId: data.projectId, status: 'active' },
        select: { userId: true },
      }),
    ]);
    if (!submission || submission.deletedAt) {
      return; // deleted before we got to it
    }

    const what = submission.photoKey ? 'added a photo' : 'commented';
    await this.push.sendToUsers(
      // Everyone but the author — no point notifying yourself.
      members.map((m) => m.userId).filter((id) => id !== data.authorId),
      {
        title: `New submission on "${submission.task.title}"`,
        body: `${submission.user.name} ${what}${
          submission.comment ? `: ${submission.comment.slice(0, 120)}` : ''
        }`,
        data: { type: 'submission', projectId: data.projectId, taskId: data.taskId },
      },
    );
  }
}
