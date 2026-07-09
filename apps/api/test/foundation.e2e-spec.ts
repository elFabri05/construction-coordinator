import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 1 foundation e2e: auth, projects, memberships/roles, and
 * server-side permission enforcement. Runs against a real Postgres
 * (DATABASE_URL) and wipes the schema's rows before starting.
 */
describe('Phase 1 foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  const alice = { email: 'alice@example.com', password: 'password123', name: 'Alice Architect' };
  const bob = { email: 'bob@example.com', password: 'password456', name: 'Bob Builder' };
  const carol = { email: 'carol@example.com', password: 'password789', name: 'Carol Concrete' };

  let aliceToken: string;
  let aliceRefreshToken: string;
  let aliceId: string;
  let bobToken: string;
  let bobId: string;
  let projectId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = app.getHttpServer();

    prisma = app.get(PrismaService);
    await prisma.membership.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('auth', () => {
    it('rejects registration with an invalid email', async () => {
      await request(http)
        .post('/auth/register')
        .send({ ...alice, email: 'not-an-email' })
        .expect(400);
    });

    it('rejects registration with a too-short password', async () => {
      await request(http)
        .post('/auth/register')
        .send({ ...alice, password: 'short' })
        .expect(400);
    });

    it('registers a new user and returns tokens', async () => {
      const res = await request(http).post('/auth/register').send(alice).expect(201);

      expect(res.body.user.email).toBe(alice.email);
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      aliceId = res.body.user.id;
    });

    it('rejects a duplicate registration', async () => {
      await request(http).post('/auth/register').send(alice).expect(409);
    });

    it('rejects login with a wrong password', async () => {
      await request(http)
        .post('/auth/login')
        .send({ email: alice.email, password: 'wrong-password' })
        .expect(401);
    });

    it('logs in and returns tokens', async () => {
      const res = await request(http)
        .post('/auth/login')
        .send({ email: alice.email, password: alice.password })
        .expect(200);

      aliceToken = res.body.accessToken;
      aliceRefreshToken = res.body.refreshToken;
      expect(aliceToken).toBeDefined();
    });

    it('returns the current user on /auth/me', async () => {
      const res = await request(http).get('/auth/me').set(auth(aliceToken)).expect(200);
      expect(res.body.email).toBe(alice.email);
    });

    it('rejects /auth/me without a token', async () => {
      await request(http).get('/auth/me').expect(401);
    });

    it('issues new tokens from a refresh token', async () => {
      const res = await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: aliceRefreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      await request(http).get('/auth/me').set(auth(res.body.accessToken)).expect(200);
    });

    it('rejects an access token used as a refresh token', async () => {
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: aliceToken })
        .expect(401);
    });
  });

  describe('projects', () => {
    beforeAll(async () => {
      const res = await request(http).post('/auth/register').send(bob).expect(201);
      bobToken = res.body.accessToken;
      bobId = res.body.user.id;
    });

    it('rejects project creation without a name', async () => {
      await request(http)
        .post('/projects')
        .set(auth(aliceToken))
        .send({ name: '', goal: 'A pool' })
        .expect(400);
    });

    it('creates a project and auto-creates the owner membership', async () => {
      const res = await request(http)
        .post('/projects')
        .set(auth(aliceToken))
        .send({ name: 'Pool build', goal: 'Build a 10m pool with terrace' })
        .expect(201);

      projectId = res.body.id;
      expect(res.body.ownerId).toBe(aliceId);

      const members = await request(http)
        .get(`/projects/${projectId}/members`)
        .set(auth(aliceToken))
        .expect(200);

      expect(members.body).toHaveLength(1);
      expect(members.body[0]).toMatchObject({
        userId: aliceId,
        role: 'owner',
        status: 'active',
      });
    });

    it('lists the project with the caller role', async () => {
      const res = await request(http).get('/projects').set(auth(aliceToken)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: projectId, myRole: 'owner' });
    });

    it('does not list projects the caller is not a member of', async () => {
      const res = await request(http).get('/projects').set(auth(bobToken)).expect(200);
      expect(res.body).toHaveLength(0);
    });

    it('returns 403 on project detail for a non-member', async () => {
      await request(http).get(`/projects/${projectId}`).set(auth(bobToken)).expect(403);
    });

    it('returns 401 on project detail without a token', async () => {
      await request(http).get(`/projects/${projectId}`).expect(401);
    });
  });

  describe('invites', () => {
    it('rejects an invite from a non-member', async () => {
      await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(bobToken))
        .send({ email: 'someone@example.com' })
        .expect(403);
    });

    it('rejects an invite with role owner', async () => {
      await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(aliceToken))
        .send({ email: bob.email, role: 'owner' })
        .expect(400);
    });

    it('lets the owner invite an existing user (defaults to member)', async () => {
      const res = await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(aliceToken))
        .send({ email: bob.email })
        .expect(201);

      expect(res.body).toMatchObject({
        userId: bobId,
        role: 'member',
        status: 'active',
        invitedById: aliceId,
      });
    });

    it('rejects inviting the same user twice', async () => {
      await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(aliceToken))
        .send({ email: bob.email })
        .expect(409);
    });

    it('shows the project in the invited member\'s list', async () => {
      const res = await request(http).get('/projects').set(auth(bobToken)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: projectId, myRole: 'member' });

      await request(http).get(`/projects/${projectId}`).set(auth(bobToken)).expect(200);
    });

    it('rejects an invite from a member (owner/superuser only)', async () => {
      await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(bobToken))
        .send({ email: 'dave@example.com' })
        .expect(403);
    });

    it('creates a placeholder user + invited membership for an unknown email', async () => {
      await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(aliceToken))
        .send({ email: carol.email })
        .expect(201);

      const members = await request(http)
        .get(`/projects/${projectId}/members`)
        .set(auth(aliceToken))
        .expect(200);

      const carolMember = members.body.find(
        (m: { user: { email: string } }) => m.user.email === carol.email,
      );
      expect(carolMember).toMatchObject({ role: 'member', status: 'invited' });
    });

    it('rejects login for a placeholder user that has not registered', async () => {
      await request(http)
        .post('/auth/login')
        .send({ email: carol.email, password: 'whatever-123' })
        .expect(401);
    });

    it('activates the membership when the placeholder user registers', async () => {
      const res = await request(http).post('/auth/register').send(carol).expect(201);
      const carolToken = res.body.accessToken;

      const projects = await request(http).get('/projects').set(auth(carolToken)).expect(200);
      expect(projects.body).toHaveLength(1);
      expect(projects.body[0]).toMatchObject({ id: projectId, myRole: 'member' });

      const members = await request(http)
        .get(`/projects/${projectId}/members`)
        .set(auth(carolToken))
        .expect(200);
      const carolMember = members.body.find(
        (m: { user: { email: string } }) => m.user.email === carol.email,
      );
      expect(carolMember.status).toBe('active');
    });
  });

  describe('role changes', () => {
    it('rejects a role change from a member (even on themselves)', async () => {
      await request(http)
        .patch(`/projects/${projectId}/members/${bobId}`)
        .set(auth(bobToken))
        .send({ role: 'superuser' })
        .expect(403);
    });

    it('rejects assigning the owner role', async () => {
      await request(http)
        .patch(`/projects/${projectId}/members/${bobId}`)
        .set(auth(aliceToken))
        .send({ role: 'owner' })
        .expect(400);
    });

    it('lets the owner promote a member to superuser', async () => {
      const res = await request(http)
        .patch(`/projects/${projectId}/members/${bobId}`)
        .set(auth(aliceToken))
        .send({ role: 'superuser' })
        .expect(200);

      expect(res.body).toMatchObject({ userId: bobId, role: 'superuser' });
    });

    it('lets a superuser invite (but still not change roles)', async () => {
      await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(bobToken))
        .send({ email: 'dave@example.com' })
        .expect(201);

      const carolId = (
        await prisma.user.findUniqueOrThrow({ where: { email: carol.email } })
      ).id;
      await request(http)
        .patch(`/projects/${projectId}/members/${carolId}`)
        .set(auth(bobToken))
        .send({ role: 'superuser' })
        .expect(403);
    });

    it('never allows changing the owner\'s role', async () => {
      await request(http)
        .patch(`/projects/${projectId}/members/${aliceId}`)
        .set(auth(aliceToken))
        .send({ role: 'member' })
        .expect(403);
    });

    it('returns 404 when changing the role of a non-member', async () => {
      await request(http)
        .patch(`/projects/${projectId}/members/00000000-0000-0000-0000-000000000000`)
        .set(auth(aliceToken))
        .send({ role: 'member' })
        .expect(404);
    });

    it('lets the owner demote a superuser back to member', async () => {
      const res = await request(http)
        .patch(`/projects/${projectId}/members/${bobId}`)
        .set(auth(aliceToken))
        .send({ role: 'member' })
        .expect(200);

      expect(res.body.role).toBe('member');

      // And the demoted member loses invite rights again.
      await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(bobToken))
        .send({ email: 'eve@example.com' })
        .expect(403);
    });
  });

  describe('project-scoped roles', () => {
    it('gives the same user different roles in different projects', async () => {
      const res = await request(http)
        .post('/projects')
        .set(auth(bobToken))
        .send({ name: 'Bob\'s own build', goal: 'Garage extension' })
        .expect(201);

      const projects = await request(http).get('/projects').set(auth(bobToken)).expect(200);
      const roles = Object.fromEntries(
        projects.body.map((p: { id: string; myRole: string }) => [p.id, p.myRole]),
      );
      expect(roles[projectId]).toBe('member');
      expect(roles[res.body.id]).toBe('owner');
    });
  });
});
