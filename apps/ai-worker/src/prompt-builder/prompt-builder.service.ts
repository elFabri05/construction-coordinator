import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubmissionReviewJob } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ContentBlock, ReviewContext, mediaTypeForKey } from './review-context';

/** Default cap on submissions per task sent to the model (config: SUBMISSION_HISTORY_LIMIT). */
const DEFAULT_HISTORY_LIMIT = 10;

const SYSTEM_PROMPT = `You are the AI coordination reviewer for a construction project management tool. Field workers post submissions (photos and comments) as evidence of progress on tasks. You review new submissions against the project goal, the project guidelines, and the task sequence, and flag ONLY genuine problems.

What counts as genuine signal:
- A photo or comment that contradicts the project guidelines (e.g. wrong material, wrong method, safety issue visible in a photo).
- Work that appears to be happening out of sequence, or a task that looks blocked by an unfinished earlier task.
- Evidence that completed work needs rework.
- A clearly described blocker.

Most submissions are routine progress updates with nothing wrong. When that is the case, return an empty array. Do NOT invent concerns, restate the obvious, or flag cosmetic uncertainty — a review queue full of noise gets ignored, which is worse than no review at all. Return [] liberally.

Respond with ONLY a JSON array (no prose, no code fences) of suggestion objects with this exact shape:
[
  {
    "suggestion_type": "resequence" | "rework" | "blocker" | "guideline_conflict" | "other",
    "related_task_ids": ["<task id>"],
    "summary": "one sentence",
    "detail": "fuller reasoning, 2-4 sentences",
    "confidence": "low" | "medium" | "high"
  }
]

Rules:
- related_task_ids may only contain task ids listed in the context you are given.
- Use "confidence" honestly; only medium/high suggestions are shown to humans.
- If there is nothing worth flagging, respond with exactly: []`;

@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);
  private readonly historyLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.historyLimit = Number(
      config.get<string>('SUBMISSION_HISTORY_LIMIT') ?? DEFAULT_HISTORY_LIMIT,
    );
  }

  /**
   * Assembles the review context for a job: project goal + guidelines, the
   * task with its immediate sequence neighbors, and the task's recent
   * submissions (comments as text, photos as image blocks). Returns null when
   * the task no longer exists — the job is then skipped.
   */
  async build(job: SubmissionReviewJob): Promise<ReviewContext | null> {
    const task = await this.prisma.task.findFirst({
      where: { id: job.taskId, projectId: job.projectId },
      include: { project: true },
    });
    if (!task) {
      this.logger.warn(`Task ${job.taskId} no longer exists — skipping review`);
      return null;
    }

    const [guideline, neighbors, submissions] = await Promise.all([
      this.prisma.guideline.findUnique({ where: { projectId: job.projectId } }),
      this.prisma.task.findMany({
        where: {
          projectId: job.projectId,
          sequenceOrder: { in: [task.sequenceOrder - 1, task.sequenceOrder + 1] },
        },
        orderBy: { sequenceOrder: 'asc' },
      }),
      // Newest N, then reversed so the model reads them chronologically.
      this.prisma.submission.findMany({
        where: { taskId: task.id, deletedAt: null },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: this.historyLimit,
      }),
    ]);
    submissions.reverse();

    const tasksInScope = [
      ...neighbors.filter((t) => t.sequenceOrder < task.sequenceOrder),
      task,
      ...neighbors.filter((t) => t.sequenceOrder > task.sequenceOrder),
    ];

    const describeTask = (t: (typeof tasksInScope)[number]): string => {
      const role =
        t.id === task.id
          ? 'TASK UNDER REVIEW'
          : t.sequenceOrder < task.sequenceOrder
            ? 'previous task in sequence'
            : 'next task in sequence';
      return [
        `- [${role}] id: ${t.id}`,
        `  title: ${t.title}`,
        t.description ? `  description: ${t.description}` : null,
        `  status: ${t.status}, sequence position: ${t.sequenceOrder}`,
      ]
        .filter((line): line is string => line !== null)
        .join('\n');
    };

    const content: ContentBlock[] = [
      {
        type: 'text',
        text: [
          `# Project: ${task.project.name}`,
          `Goal: ${task.project.goal}`,
          '',
          '# Guidelines',
          guideline?.content ?? '(no guidelines have been written for this project yet)',
          '',
          '# Tasks in scope',
          tasksInScope.map(describeTask).join('\n'),
          '',
          `# Recent submissions on the task under review (oldest first, capped at ${this.historyLimit})`,
        ].join('\n'),
      },
    ];

    for (const [index, submission] of submissions.entries()) {
      const lines = [
        `## Submission ${index + 1} of ${submissions.length}`,
        `By ${submission.user.name} at ${submission.createdAt.toISOString()}`,
        submission.comment ? `Comment: ${submission.comment}` : 'No comment.',
      ];
      if (submission.photoKey) {
        const data = await this.storage.getObjectBase64(submission.photoKey);
        if (data) {
          lines.push('Photo attached (next image block):');
          content.push({ type: 'text', text: lines.join('\n') });
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaTypeForKey(submission.photoKey),
              data,
            },
          });
          continue;
        }
        lines.push('(a photo was attached but could not be loaded)');
      }
      content.push({ type: 'text', text: lines.join('\n') });
    }

    content.push({
      type: 'text',
      text: 'Review the submissions above. Respond with ONLY the JSON array (or [] if nothing is worth flagging).',
    });

    return {
      system: SYSTEM_PROMPT,
      content,
      validTaskIds: tasksInScope.map((t) => t.id),
    };
  }
}
