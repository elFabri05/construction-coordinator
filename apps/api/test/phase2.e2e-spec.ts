import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 2 e2e: guidelines + tasks, with the permission matrix exercised
 * explicitly for every role.
 *
 * NOTE: there is deliberately nothing owner-only in this phase — superuser
 * and owner must behave IDENTICALLY on every guideline/task route. If you
 * find yourself making one of these routes owner-only, that's a product
 * decision to raise, not a refactor.
 */
describe('Phase 2: guidelines & tasks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  const owner = { email: 'olivia@example.com', password: 'password123', name: 'Olivia Owner' };
  const superuser = { email: 'sam@example.com', password: 'password123', name: 'Sam Super' };
  const member = { email: 'mia@example.com', password: 'password123', name: 'Mia Member' };

  let ownerToken: string;
  let superuserToken: string;
  let memberToken: string;
  let projectId: string;
  let otherProjectId: string;
  let taskIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createTask = async (title: string) => {
    const res = await request(http)
      .post(`/projects/${projectId}/tasks`)
      .set(auth(ownerToken))
      .send({ title, description: `${title} description` })
      .expect(201);
    return res.body.id as string;
  };

  const currentOrder = async () => {
    const res = await request(http)
      .get(`/projects/${projectId}/tasks`)
      .set(auth(memberToken))
      .expect(200);
    return res.body.map((t: { id: string }) => t.id) as string[];
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
    await prisma.task.deleteMany();
    await prisma.guideline.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();

    // Owner + project, superuser (invited then promoted), plain member.
    const ownerRes = await request(http).post('/auth/register').send(owner).expect(201);
    ownerToken = ownerRes.body.accessToken;

    const projectRes = await request(http)
      .post('/projects')
      .set(auth(ownerToken))
      .send({ name: 'Pool build', goal: 'Build the pool' })
      .expect(201);
    projectId = projectRes.body.id;

    const superuserRes = await request(http).post('/auth/register').send(superuser).expect(201);
    superuserToken = superuserRes.body.accessToken;
    await request(http)
      .post(`/projects/${projectId}/invite`)
      .set(auth(ownerToken))
      .send({ email: superuser.email })
      .expect(201);
    await request(http)
      .patch(`/projects/${projectId}/members/${superuserRes.body.user.id}`)
      .set(auth(ownerToken))
      .send({ role: 'superuser' })
      .expect(200);

    const memberRes = await request(http).post('/auth/register').send(member).expect(201);
    memberToken = memberRes.body.accessToken;
    await request(http)
      .post(`/projects/${projectId}/invite`)
      .set(auth(ownerToken))
      .send({ email: member.email })
      .expect(201);

    // A second project the member has NO membership in, for cross-project checks.
    const otherRes = await request(http)
      .post('/projects')
      .set(auth(superuserToken))
      .send({ name: 'Other build', goal: 'Unrelated' })
      .expect(201);
    otherProjectId = otherRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('guidelines', () => {
    it('returns 404 while no guideline exists', async () => {
      await request(http)
        .get(`/projects/${projectId}/guideline`)
        .set(auth(memberToken))
        .expect(404);
    });

    it('rejects a guideline write from a member', async () => {
      await request(http)
        .put(`/projects/${projectId}/guideline`)
        .set(auth(memberToken))
        .send({ content: 'Members cannot write this' })
        .expect(403);
    });

    it('lets the owner create the guideline', async () => {
      const res = await request(http)
        .put(`/projects/${projectId}/guideline`)
        .set(auth(ownerToken))
        .send({ content: 'Always wear helmets on site.' })
        .expect(200);

      expect(res.body.content).toBe('Always wear helmets on site.');
      expect(res.body.updatedBy.email).toBe(owner.email);
    });

    // Superuser and owner are equivalent here by design (see file header).
    it('lets a superuser update the guideline (upsert, same row)', async () => {
      const res = await request(http)
        .put(`/projects/${projectId}/guideline`)
        .set(auth(superuserToken))
        .send({ content: 'Helmets AND boots on site.' })
        .expect(200);

      expect(res.body.updatedBy.email).toBe(superuser.email);

      const rows = await prisma.guideline.findMany({ where: { projectId } });
      expect(rows).toHaveLength(1);
    });

    it('lets a member read the guideline', async () => {
      const res = await request(http)
        .get(`/projects/${projectId}/guideline`)
        .set(auth(memberToken))
        .expect(200);
      expect(res.body.content).toBe('Helmets AND boots on site.');
    });

    it('rejects a non-member read', async () => {
      await request(http)
        .get(`/projects/${otherProjectId}/guideline`)
        .set(auth(memberToken))
        .expect(403);
    });

    it('rejects over-long guideline content', async () => {
      await request(http)
        .put(`/projects/${projectId}/guideline`)
        .set(auth(ownerToken))
        .send({ content: 'x'.repeat(10001) })
        .expect(400);
    });
  });

  describe('tasks: create/read', () => {
    it('rejects task creation from a member', async () => {
      await request(http)
        .post(`/projects/${projectId}/tasks`)
        .set(auth(memberToken))
        .send({ title: 'Sneaky task' })
        .expect(403);
    });

    it('rejects a task without a title', async () => {
      await request(http)
        .post(`/projects/${projectId}/tasks`)
        .set(auth(ownerToken))
        .send({ title: '', description: 'no title' })
        .expect(400);
    });

    it('creates tasks with incrementing sequence order (owner)', async () => {
      taskIds = [
        await createTask('Excavate'),
        await createTask('Pour concrete'),
        await createTask('Tile the pool'),
      ];

      const res = await request(http)
        .get(`/projects/${projectId}/tasks`)
        .set(auth(memberToken))
        .expect(200);

      expect(res.body.map((t: { sequenceOrder: number }) => t.sequenceOrder)).toEqual([1, 2, 3]);
      expect(res.body[0].status).toBe('pending');
    });

    it('lets a superuser create a task too', async () => {
      const res = await request(http)
        .post(`/projects/${projectId}/tasks`)
        .set(auth(superuserToken))
        .send({ title: 'Fill with water' })
        .expect(201);
      expect(res.body.sequenceOrder).toBe(4);
      taskIds.push(res.body.id);
    });

    it('lets a member read the task list and detail', async () => {
      const res = await request(http)
        .get(`/projects/${projectId}/tasks/${taskIds[0]}`)
        .set(auth(memberToken))
        .expect(200);
      expect(res.body.title).toBe('Excavate');
    });

    it('filters the list by ?status=', async () => {
      const res = await request(http)
        .get(`/projects/${projectId}/tasks?status=pending`)
        .set(auth(memberToken))
        .expect(200);
      expect(res.body).toHaveLength(4);

      await request(http)
        .get(`/projects/${projectId}/tasks?status=bogus`)
        .set(auth(memberToken))
        .expect(400);
    });

    it('does not leak a task through another project id', async () => {
      await request(http)
        .get(`/projects/${otherProjectId}/tasks/${taskIds[0]}`)
        .set(auth(superuserToken))
        .expect(404);
    });
  });

  describe('tasks: member status updates (the one member write)', () => {
    it('lets a member update a task status', async () => {
      const res = await request(http)
        .patch(`/projects/${projectId}/tasks/${taskIds[0]}/status`)
        .set(auth(memberToken))
        .send({ status: 'in_progress' })
        .expect(200);
      expect(res.body.status).toBe('in_progress');
    });

    it('accepts any transition (unrestricted by design for now)', async () => {
      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskIds[1]}/status`)
        .set(auth(memberToken))
        .send({ status: 'done' })
        .expect(200);
    });

    it('rejects an invalid status value', async () => {
      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskIds[0]}/status`)
        .set(auth(memberToken))
        .send({ status: 'finished' })
        .expect(400);
    });

    it('rejects smuggling other fields through the status route', async () => {
      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskIds[0]}/status`)
        .set(auth(memberToken))
        .send({ status: 'done', title: 'Hijacked title' })
        .expect(400);

      const res = await request(http)
        .get(`/projects/${projectId}/tasks/${taskIds[0]}`)
        .set(auth(memberToken))
        .expect(200);
      expect(res.body.title).toBe('Excavate');
    });

    it('rejects a member editing title/description/sequence via PATCH', async () => {
      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskIds[0]}`)
        .set(auth(memberToken))
        .send({ title: 'New title' })
        .expect(403);
    });
  });

  describe('tasks: owner/superuser edits', () => {
    it('lets a superuser edit title and description', async () => {
      const res = await request(http)
        .patch(`/projects/${projectId}/tasks/${taskIds[0]}`)
        .set(auth(superuserToken))
        .send({ title: 'Excavate site', description: 'Dig 2m deep' })
        .expect(200);
      expect(res.body.title).toBe('Excavate site');
    });

    it('lets the owner edit too (identical to superuser)', async () => {
      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskIds[0]}`)
        .set(auth(ownerToken))
        .send({ description: 'Dig 2.5m deep' })
        .expect(200);
    });
  });

  describe('tasks: reorder', () => {
    it('rejects reorder from a member', async () => {
      await request(http)
        .patch(`/projects/${projectId}/tasks/reorder`)
        .set(auth(memberToken))
        .send({ taskIds: [...taskIds].reverse() })
        .expect(403);
    });

    it('rejects duplicate ids', async () => {
      await request(http)
        .patch(`/projects/${projectId}/tasks/reorder`)
        .set(auth(ownerToken))
        .send({ taskIds: [taskIds[0], taskIds[0]] })
        .expect(400);
    });

    it('updates all sequence_order values in one call (superuser)', async () => {
      const newOrder = [taskIds[3], taskIds[0], taskIds[2], taskIds[1]];
      const res = await request(http)
        .patch(`/projects/${projectId}/tasks/reorder`)
        .set(auth(superuserToken))
        .send({ taskIds: newOrder })
        .expect(200);

      expect(res.body.map((t: { id: string }) => t.id)).toEqual(newOrder);
      expect(res.body.map((t: { sequenceOrder: number }) => t.sequenceOrder)).toEqual([1, 2, 3, 4]);
      expect(await currentOrder()).toEqual(newOrder);
    });

    it('rolls back the whole reorder when one id fails mid-transaction', async () => {
      const before = await currentOrder();

      // First id is valid and would be renumbered to 1; the bogus second id
      // fails inside the transaction, so the first update must roll back.
      await request(http)
        .patch(`/projects/${projectId}/tasks/reorder`)
        .set(auth(ownerToken))
        .send({ taskIds: [before[3], '00000000-0000-0000-0000-000000000000'] })
        .expect(404);

      expect(await currentOrder()).toEqual(before);
    });

    it('rolls back when an id belongs to another project', async () => {
      const before = await currentOrder();
      const foreign = await request(http)
        .post(`/projects/${otherProjectId}/tasks`)
        .set(auth(superuserToken))
        .send({ title: 'Foreign task' })
        .expect(201);

      await request(http)
        .patch(`/projects/${projectId}/tasks/reorder`)
        .set(auth(ownerToken))
        .send({ taskIds: [before[1], foreign.body.id] })
        .expect(404);

      expect(await currentOrder()).toEqual(before);
    });
  });

  describe('tasks: delete', () => {
    it('rejects delete from a member', async () => {
      await request(http)
        .delete(`/projects/${projectId}/tasks/${taskIds[0]}`)
        .set(auth(memberToken))
        .expect(403);
    });

    it('lets a superuser delete a task', async () => {
      await request(http)
        .delete(`/projects/${projectId}/tasks/${taskIds[1]}`)
        .set(auth(superuserToken))
        .expect(204);

      await request(http)
        .get(`/projects/${projectId}/tasks/${taskIds[1]}`)
        .set(auth(memberToken))
        .expect(404);
    });
  });
});
