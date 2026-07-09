import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 3 e2e: submissions (photo/comment evidence) + presigned storage flow.
 *
 * Presigned URLs are computed locally by the AWS SDK, so these tests run with
 * dummy S3 credentials and never touch a real bucket — the URL shape and key
 * namespacing are still fully exercised.
 */
describe('Phase 3: submissions & storage (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  const owner = { email: 'owner3@example.com', password: 'password123', name: 'Ova Owner' };
  const superuser = { email: 'super3@example.com', password: 'password123', name: 'Sue Super' };
  const memberA = { email: 'membera@example.com', password: 'password123', name: 'Mo MemberA' };
  const memberB = { email: 'memberb@example.com', password: 'password123', name: 'Max MemberB' };

  let ownerToken: string;
  let superuserToken: string;
  let memberAToken: string;
  let memberBToken: string;
  let projectId: string;
  let taskId: string;
  let otherProjectId: string;
  let otherTaskId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const base = () => `/projects/${projectId}/tasks/${taskId}/submissions`;

  const register = async (user: { email: string; password: string; name: string }) => {
    const res = await request(http).post('/auth/register').send(user).expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    prisma = app.get(PrismaService);
    await prisma.submission.deleteMany();
    await prisma.task.deleteMany();
    await prisma.guideline.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();

    ({ token: ownerToken } = await register(owner));

    const projectRes = await request(http)
      .post('/projects')
      .set(auth(ownerToken))
      .send({ name: 'Pool build', goal: 'Build the pool' })
      .expect(201);
    projectId = projectRes.body.id;

    const taskRes = await request(http)
      .post(`/projects/${projectId}/tasks`)
      .set(auth(ownerToken))
      .send({ title: 'Pour concrete' })
      .expect(201);
    taskId = taskRes.body.id;

    const su = await register(superuser);
    superuserToken = su.token;
    await request(http)
      .post(`/projects/${projectId}/invite`)
      .set(auth(ownerToken))
      .send({ email: superuser.email })
      .expect(201);
    await request(http)
      .patch(`/projects/${projectId}/members/${su.id}`)
      .set(auth(ownerToken))
      .send({ role: 'superuser' })
      .expect(200);

    ({ token: memberAToken } = await register(memberA));
    await request(http)
      .post(`/projects/${projectId}/invite`)
      .set(auth(ownerToken))
      .send({ email: memberA.email })
      .expect(201);

    ({ token: memberBToken } = await register(memberB));
    await request(http)
      .post(`/projects/${projectId}/invite`)
      .set(auth(ownerToken))
      .send({ email: memberB.email })
      .expect(201);

    // Second project + task that memberA has no access to.
    const otherProject = await request(http)
      .post('/projects')
      .set(auth(superuserToken))
      .send({ name: 'Other build', goal: 'Unrelated' })
      .expect(201);
    otherProjectId = otherProject.body.id;
    const otherTask = await request(http)
      .post(`/projects/${otherProjectId}/tasks`)
      .set(auth(superuserToken))
      .send({ title: 'Other task' })
      .expect(201);
    otherTaskId = otherTask.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('upload URLs', () => {
    it('gives any active member a presigned upload URL with a task-scoped key', async () => {
      const res = await request(http)
        .post(`${base()}/upload-url`)
        .set(auth(memberAToken))
        .send({ contentType: 'image/jpeg' })
        .expect(200);

      expect(res.body.objectKey).toMatch(
        new RegExp(`^projects/${projectId}/tasks/${taskId}/[0-9a-f-]+\\.jpg$`),
      );
      // A presigned URL, not an API route: photo bytes never touch this server.
      expect(res.body.uploadUrl).toContain(res.body.objectKey);
      expect(res.body.uploadUrl).toContain('X-Amz-Signature=');
    });

    it('rejects an unknown content type', async () => {
      await request(http)
        .post(`${base()}/upload-url`)
        .set(auth(memberAToken))
        .send({ contentType: 'application/pdf' })
        .expect(400);
    });

    it('rejects a non-member', async () => {
      await request(http)
        .post(`/projects/${otherProjectId}/tasks/${otherTaskId}/submissions/upload-url`)
        .set(auth(memberAToken))
        .send({})
        .expect(403);
    });

    it('404s when the task does not belong to the project', async () => {
      await request(http)
        .post(`/projects/${projectId}/tasks/${otherTaskId}/submissions/upload-url`)
        .set(auth(memberAToken))
        .send({})
        .expect(404);
    });
  });

  describe('creating submissions', () => {
    let memberAKey: string;

    it('rejects a submission with neither comment nor photoKey', async () => {
      await request(http).post(base()).set(auth(memberAToken)).send({}).expect(400);
    });

    it('rejects a whitespace-only comment without a photo', async () => {
      await request(http)
        .post(base())
        .set(auth(memberAToken))
        .send({ comment: '   ' })
        .expect(400);
    });

    it('rejects an over-long comment', async () => {
      await request(http)
        .post(base())
        .set(auth(memberAToken))
        .send({ comment: 'x'.repeat(2001) })
        .expect(400);
    });

    it('rejects a thumbnailKey without a photoKey', async () => {
      await request(http)
        .post(base())
        .set(auth(memberAToken))
        .send({ comment: 'hi', thumbnailKey: `projects/${projectId}/tasks/${taskId}/t.jpg` })
        .expect(400);
    });

    it('rejects a photoKey issued for a different task', async () => {
      await request(http)
        .post(base())
        .set(auth(memberAToken))
        .send({ photoKey: `projects/${otherProjectId}/tasks/${otherTaskId}/x.jpg` })
        .expect(400);
    });

    it('creates a comment-only submission', async () => {
      const res = await request(http)
        .post(base())
        .set(auth(memberAToken))
        .send({ comment: 'Rebar is in, ready for the pour tomorrow.' })
        .expect(201);

      expect(res.body.comment).toBe('Rebar is in, ready for the pour tomorrow.');
      expect(res.body.photoUrl).toBeNull();
      expect(res.body.user.email).toBe(memberA.email);
    });

    it('creates a photo submission with signed read URLs', async () => {
      const urlRes = await request(http)
        .post(`${base()}/upload-url`)
        .set(auth(memberAToken))
        .send({})
        .expect(200);
      memberAKey = urlRes.body.objectKey;

      const thumbRes = await request(http)
        .post(`${base()}/upload-url`)
        .set(auth(memberAToken))
        .send({})
        .expect(200);

      const res = await request(http)
        .post(base())
        .set(auth(memberAToken))
        .send({
          comment: 'Pour done, see photo',
          photoKey: memberAKey,
          thumbnailKey: thumbRes.body.objectKey,
        })
        .expect(201);

      // Only keys are stored; URLs are signed per response.
      expect(res.body.photoUrl).toContain(memberAKey);
      expect(res.body.photoUrl).toContain('X-Amz-Signature=');
      expect(res.body.thumbnailUrl).toContain('X-Amz-Signature=');

      const row = await prisma.submission.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.photoKey).toBe(memberAKey);
    });
  });

  describe('listing submissions', () => {
    it('returns submissions newest-first to any active member', async () => {
      const res = await request(http).get(base()).set(auth(memberBToken)).expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].comment).toBe('Pour done, see photo');
      expect(res.body[1].comment).toBe('Rebar is in, ready for the pour tomorrow.');
      expect(
        new Date(res.body[0].createdAt).getTime(),
      ).toBeGreaterThanOrEqual(new Date(res.body[1].createdAt).getTime());
    });

    it('rejects a non-member', async () => {
      await request(http)
        .get(`/projects/${otherProjectId}/tasks/${otherTaskId}/submissions`)
        .set(auth(memberAToken))
        .expect(403);
    });
  });

  describe('immutability & deletion', () => {
    let memberASubmissionId: string;

    beforeAll(async () => {
      const res = await request(http)
        .post(base())
        .set(auth(memberAToken))
        .send({ comment: 'To be deleted' })
        .expect(201);
      memberASubmissionId = res.body.id;
    });

    it('has no update route — submissions are immutable', async () => {
      await request(http)
        .patch(`${base()}/${memberASubmissionId}`)
        .set(auth(memberAToken))
        .send({ comment: 'rewritten history' })
        .expect(404);
    });

    it('rejects deletion by a different member', async () => {
      await request(http)
        .delete(`${base()}/${memberASubmissionId}`)
        .set(auth(memberBToken))
        .expect(403);
    });

    it('lets the author soft-delete their own submission', async () => {
      await request(http)
        .delete(`${base()}/${memberASubmissionId}`)
        .set(auth(memberAToken))
        .expect(204);

      // Excluded from the feed…
      const res = await request(http).get(base()).set(auth(memberAToken)).expect(200);
      expect(res.body.map((s: { id: string }) => s.id)).not.toContain(memberASubmissionId);

      // …but still in the DB with deletedAt set (audit trail for the AI layer).
      const row = await prisma.submission.findUniqueOrThrow({
        where: { id: memberASubmissionId },
      });
      expect(row.deletedAt).not.toBeNull();
    });

    it('404s on deleting an already-deleted submission', async () => {
      await request(http)
        .delete(`${base()}/${memberASubmissionId}`)
        .set(auth(memberAToken))
        .expect(404);
    });

    it('lets the owner delete any submission', async () => {
      const res = await request(http)
        .post(base())
        .set(auth(memberBToken))
        .send({ comment: 'Owner will remove this' })
        .expect(201);

      await request(http).delete(`${base()}/${res.body.id}`).set(auth(ownerToken)).expect(204);
    });

    it('lets a superuser delete any submission', async () => {
      const res = await request(http)
        .post(base())
        .set(auth(memberBToken))
        .send({ comment: 'Superuser will remove this' })
        .expect(201);

      await request(http)
        .delete(`${base()}/${res.body.id}`)
        .set(auth(superuserToken))
        .expect(204);
    });
  });
});
