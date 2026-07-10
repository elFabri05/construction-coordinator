import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { SubmissionReviewQueueService } from '../src/queue/submission-review-queue.service';

/**
 * Phase 4 e2e: AI suggestion review queue.
 *
 * The BullMQ producer is mocked (no Redis in CI) — we assert the enqueue
 * contract, not Redis delivery. Claude is never called here: the worker is a
 * separate process with its own unit tests (apps/ai-worker).
 */
describe('Phase 4: AI suggestions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  const reviewQueueMock = { enqueueSubmissionReview: jest.fn().mockResolvedValue(undefined) };

  const owner = { email: 'owner4@example.com', password: 'password123', name: 'Ova Owner' };
  const superuser = { email: 'super4@example.com', password: 'password123', name: 'Sue Super' };
  const member = { email: 'member4@example.com', password: 'password123', name: 'Mo Member' };
  const outsider = { email: 'outsider4@example.com', password: 'password123', name: 'Out Sider' };

  let ownerToken: string;
  let ownerId: string;
  let superuserToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let projectId: string;
  let taskId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const register = async (user: { email: string; password: string; name: string }) => {
    const res = await request(http).post('/auth/register').send(user).expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  };

  const seedSuggestion = (overrides: Record<string, unknown> = {}) =>
    prisma.aiSuggestion.create({
      data: {
        projectId,
        taskId,
        relatedTaskIds: [taskId],
        suggestionType: 'rework',
        summary: 'Rebar spacing looks wider than the guideline allows',
        detail:
          'The latest photo shows roughly 40cm spacing while the guideline requires 20cm. Recommend re-checking before the pour.',
        ...overrides,
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SubmissionReviewQueueService)
      .useValue(reviewQueueMock)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    prisma = app.get(PrismaService);
    await prisma.aiSuggestion.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.task.deleteMany();
    await prisma.guideline.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();

    ({ token: ownerToken, id: ownerId } = await register(owner));

    const projectRes = await request(http)
      .post('/projects')
      .set(auth(ownerToken))
      .send({ name: 'Bridge build', goal: 'Build the footbridge' })
      .expect(201);
    projectId = projectRes.body.id;

    const taskRes = await request(http)
      .post(`/projects/${projectId}/tasks`)
      .set(auth(ownerToken))
      .send({ title: 'Tie rebar' })
      .expect(201);
    taskId = taskRes.body.id;

    const su = await register(superuser);
    superuserToken = su.token;
    await request(http)
      .post(`/projects/${projectId}/invite`)
      .set(auth(ownerToken))
      .send({ email: superuser.email, role: 'superuser' })
      .expect(201);

    ({ token: memberToken } = await register(member));
    await request(http)
      .post(`/projects/${projectId}/invite`)
      .set(auth(ownerToken))
      .send({ email: member.email })
      .expect(201);

    ({ token: outsiderToken } = await register(outsider));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    reviewQueueMock.enqueueSubmissionReview.mockClear();
    await prisma.aiSuggestion.deleteMany();
  });

  describe('submission creation enqueues a review job', () => {
    it('enqueues { submissionId, taskId, projectId } after creating a submission', async () => {
      const res = await request(http)
        .post(`/projects/${projectId}/tasks/${taskId}/submissions`)
        .set(auth(memberToken))
        .send({ comment: 'First pour done' })
        .expect(201);

      expect(reviewQueueMock.enqueueSubmissionReview).toHaveBeenCalledTimes(1);
      expect(reviewQueueMock.enqueueSubmissionReview).toHaveBeenCalledWith({
        submissionId: res.body.id,
        taskId,
        projectId,
      });
    });

    it('does not enqueue when submission creation is rejected', async () => {
      await request(http)
        .post(`/projects/${projectId}/tasks/${taskId}/submissions`)
        .set(auth(memberToken))
        .send({})
        .expect(400);

      expect(reviewQueueMock.enqueueSubmissionReview).not.toHaveBeenCalled();
    });
  });

  describe('role enforcement', () => {
    it('member cannot list suggestions', async () => {
      await request(http)
        .get(`/projects/${projectId}/suggestions`)
        .set(auth(memberToken))
        .expect(403);
    });

    it('member cannot review a suggestion', async () => {
      const suggestion = await seedSuggestion();
      await request(http)
        .patch(`/projects/${projectId}/suggestions/${suggestion.id}`)
        .set(auth(memberToken))
        .send({ status: 'accepted' })
        .expect(403);
    });

    it('non-member cannot list suggestions', async () => {
      await request(http)
        .get(`/projects/${projectId}/suggestions`)
        .set(auth(outsiderToken))
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(http).get(`/projects/${projectId}/suggestions`).expect(401);
    });
  });

  describe('listing (owner/superuser)', () => {
    it('owner and superuser see pending suggestions, newest first', async () => {
      await seedSuggestion({ summary: 'Older suggestion' });
      await seedSuggestion({ summary: 'Newer suggestion', suggestionType: 'blocker' });

      for (const token of [ownerToken, superuserToken]) {
        const res = await request(http)
          .get(`/projects/${projectId}/suggestions?status=pending`)
          .set(auth(token))
          .expect(200);

        expect(res.body).toHaveLength(2);
        expect(res.body[0].summary).toBe('Newer suggestion');
        expect(res.body[0]).toMatchObject({
          projectId,
          taskId,
          relatedTaskIds: [taskId],
          suggestionType: 'blocker',
          status: 'pending',
          reviewedBy: null,
          reviewedAt: null,
        });
      }
    });

    it('filters by status and rejects unknown statuses', async () => {
      await seedSuggestion({ status: 'dismissed' });
      await seedSuggestion();

      const pending = await request(http)
        .get(`/projects/${projectId}/suggestions?status=pending`)
        .set(auth(ownerToken))
        .expect(200);
      expect(pending.body).toHaveLength(1);

      const all = await request(http)
        .get(`/projects/${projectId}/suggestions`)
        .set(auth(ownerToken))
        .expect(200);
      expect(all.body).toHaveLength(2);

      await request(http)
        .get(`/projects/${projectId}/suggestions?status=bogus`)
        .set(auth(ownerToken))
        .expect(400);
    });
  });

  describe('review (accept/dismiss)', () => {
    it('accepting records the decision and reviewer without touching tasks', async () => {
      const suggestion = await seedSuggestion();

      const res = await request(http)
        .patch(`/projects/${projectId}/suggestions/${suggestion.id}`)
        .set(auth(ownerToken))
        .send({ status: 'accepted' })
        .expect(200);

      expect(res.body.status).toBe('accepted');
      expect(res.body.reviewedById).toBe(ownerId);
      expect(res.body.reviewedAt).toBeTruthy();
      expect(res.body.reviewedBy.email).toBe(owner.email);

      // Accepting must NOT auto-apply anything — the task is untouched.
      const taskRow = await prisma.task.findUnique({ where: { id: taskId } });
      expect(taskRow?.title).toBe('Tie rebar');
    });

    it('a dismissed suggestion is kept for audit, not deleted', async () => {
      const suggestion = await seedSuggestion();

      await request(http)
        .patch(`/projects/${projectId}/suggestions/${suggestion.id}`)
        .set(auth(superuserToken))
        .send({ status: 'dismissed' })
        .expect(200);

      const row = await prisma.aiSuggestion.findUnique({ where: { id: suggestion.id } });
      expect(row).not.toBeNull();
      expect(row?.status).toBe('dismissed');
      expect(row?.reviewedAt).not.toBeNull();
    });

    it('a decision is final — re-reviewing returns 409', async () => {
      const suggestion = await seedSuggestion({ status: 'dismissed' });
      await request(http)
        .patch(`/projects/${projectId}/suggestions/${suggestion.id}`)
        .set(auth(ownerToken))
        .send({ status: 'accepted' })
        .expect(409);
    });

    it('rejects invalid statuses and unknown suggestions', async () => {
      const suggestion = await seedSuggestion();

      await request(http)
        .patch(`/projects/${projectId}/suggestions/${suggestion.id}`)
        .set(auth(ownerToken))
        .send({ status: 'pending' })
        .expect(400);

      await request(http)
        .patch(`/projects/${projectId}/suggestions/00000000-0000-0000-0000-000000000000`)
        .set(auth(ownerToken))
        .send({ status: 'accepted' })
        .expect(404);
    });
  });
});
