import { ConfigService } from '@nestjs/config';
import { PromptBuilderService } from './prompt-builder.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ImageBlock, TextBlock } from './review-context';

const job = { submissionId: 'sub-3', taskId: 'task-2', projectId: 'proj-1' };

const task = (id: string, sequenceOrder: number, title: string) => ({
  id,
  projectId: 'proj-1',
  title,
  description: '',
  status: 'in_progress',
  sequenceOrder,
});

const submission = (
  id: string,
  createdAt: string,
  comment: string | null,
  photoKey: string | null = null,
) => ({
  id,
  comment,
  photoKey,
  createdAt: new Date(createdAt),
  user: { name: 'Field Worker' },
});

function buildMocks() {
  const prisma = {
    task: {
      findFirst: jest.fn().mockResolvedValue({
        ...task('task-2', 2, 'Pour foundation'),
        description: 'Pour and level the concrete foundation',
        project: { name: 'Pool build', goal: 'Build a 10m pool' },
      }),
      findMany: jest.fn().mockResolvedValue([
        task('task-1', 1, 'Dig trench'),
        task('task-3', 3, 'Install rebar deck'),
      ]),
    },
    guideline: {
      findUnique: jest.fn().mockResolvedValue({ content: 'Use C25 concrete only.' }),
    },
    submission: {
      // Repository order: newest first (the service reverses to chronological).
      findMany: jest.fn().mockResolvedValue([
        submission('sub-3', '2026-07-10T12:00:00Z', 'Poured the last section', 'k/photo3.jpg'),
        submission('sub-2', '2026-07-10T11:00:00Z', null, 'k/photo2.png'),
        submission('sub-1', '2026-07-10T10:00:00Z', 'Starting the pour'),
      ]),
    },
  } as unknown as PrismaService;

  const storage = {
    getObjectBase64: jest.fn().mockResolvedValue('BASE64DATA'),
  } as unknown as StorageService;

  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;

  return { prisma, storage, config };
}

describe('PromptBuilderService', () => {
  it('assembles goal, guidelines, task neighbors and chronological submissions', async () => {
    const { prisma, storage, config } = buildMocks();
    const service = new PromptBuilderService(prisma, storage, config);

    const context = await service.build(job);
    expect(context).not.toBeNull();

    const intro = (context!.content[0] as TextBlock).text;
    expect(intro).toContain('Goal: Build a 10m pool');
    expect(intro).toContain('Use C25 concrete only.');
    expect(intro).toContain('[TASK UNDER REVIEW] id: task-2');
    expect(intro).toContain('[previous task in sequence] id: task-1');
    expect(intro).toContain('[next task in sequence] id: task-3');

    // Submissions must read oldest → newest.
    const textBlocks = context!.content
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text);
    const joined = textBlocks.join('\n');
    expect(joined.indexOf('Starting the pour')).toBeLessThan(
      joined.indexOf('Poured the last section'),
    );

    // Photos become base64 image blocks with the right media type.
    const images = context!.content.filter((b): b is ImageBlock => b.type === 'image');
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.source.media_type).sort()).toEqual([
      'image/jpeg',
      'image/png',
    ]);
    expect(images[0].source.data).toBe('BASE64DATA');

    expect(context!.validTaskIds).toEqual(['task-1', 'task-2', 'task-3']);
    expect(context!.system).toContain('Return [] liberally');
  });

  it('caps submission history via SUBMISSION_HISTORY_LIMIT (default 10)', async () => {
    const { prisma, storage, config } = buildMocks();
    const service = new PromptBuilderService(prisma, storage, config);
    await service.build(job);

    expect(prisma.submission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, orderBy: { createdAt: 'desc' } }),
    );

    const customConfig = {
      get: jest.fn((key: string) =>
        key === 'SUBMISSION_HISTORY_LIMIT' ? '3' : undefined,
      ),
    } as unknown as ConfigService;
    const capped = new PromptBuilderService(prisma, storage, customConfig);
    await capped.build(job);
    expect(prisma.submission.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 3 }),
    );
  });

  it('notes an unloadable photo instead of failing the build', async () => {
    const { prisma, storage, config } = buildMocks();
    (storage.getObjectBase64 as jest.Mock).mockResolvedValue(null);
    const service = new PromptBuilderService(prisma, storage, config);

    const context = await service.build(job);
    expect(context!.content.some((b) => b.type === 'image')).toBe(false);
    const joined = context!.content
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    expect(joined).toContain('could not be loaded');
  });

  it('returns null when the task no longer exists', async () => {
    const { prisma, storage, config } = buildMocks();
    (prisma.task.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new PromptBuilderService(prisma, storage, config);
    await expect(service.build(job)).resolves.toBeNull();
  });
});
