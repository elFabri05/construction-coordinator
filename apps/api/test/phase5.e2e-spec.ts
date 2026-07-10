import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { SubmissionDto, TaskDto, WS_EVENTS } from '@construct/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { SubmissionReviewQueueService } from '../src/queue/submission-review-queue.service';
import { NotificationsQueueService } from '../src/notifications/notifications-queue.service';
import { RealtimeService } from '../src/realtime/realtime.service';

/**
 * Phase 5 e2e: realtime sockets, device tokens, invite notifications.
 *
 * The BullMQ producers are mocked (no Redis in CI) — we assert the enqueue
 * contracts. The Socket.IO layer is exercised for real: the app listens on
 * an ephemeral port and actual socket.io clients connect with JWTs.
 */
describe('Phase 5: realtime & notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let baseUrl: string;

  const reviewQueueMock = { enqueueSubmissionReview: jest.fn().mockResolvedValue(undefined) };
  const notificationsMock = { enqueue: jest.fn().mockResolvedValue(undefined) };

  const owner = { email: 'owner5@example.com', password: 'password123', name: 'Ova Owner' };
  const member = { email: 'member5@example.com', password: 'password123', name: 'Mo Member' };
  const outsider = { email: 'outsider5@example.com', password: 'password123', name: 'Out Sider' };

  let ownerToken: string;
  let memberToken: string;
  let memberId: string;
  let outsiderToken: string;
  let outsiderId: string;
  let projectId: string;
  let taskId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const openSockets: Socket[] = [];

  const register = async (user: { email: string; password: string; name: string }) => {
    const res = await request(http).post('/auth/register').send(user).expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  };

  const connectSocket = (token?: string): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(baseUrl, {
        transports: ['websocket'],
        auth: token ? { token } : {},
        reconnection: false,
      });
      openSockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  const waitForEvent = <T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${event}`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  /** Resolves true if the event arrives within the window, false otherwise. */
  const receivedWithin = (socket: Socket, event: string, windowMs: number): Promise<boolean> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        resolve(false);
      }, windowMs);
      const handler = () => {
        clearTimeout(timer);
        resolve(true);
      };
      socket.once(event, handler);
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SubmissionReviewQueueService)
      .useValue(reviewQueueMock)
      .overrideProvider(NotificationsQueueService)
      .useValue(notificationsMock)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    // Real HTTP server on an ephemeral port so socket.io clients can connect.
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    http = app.getHttpServer();

    prisma = app.get(PrismaService);
    await prisma.deviceToken.deleteMany();
    await prisma.aiSuggestion.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.task.deleteMany();
    await prisma.guideline.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();

    ({ token: ownerToken } = await register(owner));
    ({ token: memberToken, id: memberId } = await register(member));
    ({ token: outsiderToken, id: outsiderId } = await register(outsider));

    const projectRes = await request(http)
      .post('/projects')
      .set(auth(ownerToken))
      .send({ name: 'Tower build', goal: 'Build the tower' })
      .expect(201);
    projectId = projectRes.body.id;

    await request(http)
      .post(`/projects/${projectId}/invite`)
      .set(auth(ownerToken))
      .send({ email: member.email })
      .expect(201);

    const taskRes = await request(http)
      .post(`/projects/${projectId}/tasks`)
      .set(auth(ownerToken))
      .send({ title: 'Erect scaffolding' })
      .expect(201);
    taskId = taskRes.body.id;
  });

  afterAll(async () => {
    for (const socket of openSockets) {
      socket.disconnect();
    }
    await app.close();
  });

  beforeEach(() => {
    reviewQueueMock.enqueueSubmissionReview.mockClear();
    notificationsMock.enqueue.mockClear();
    notificationsMock.enqueue.mockResolvedValue(undefined);
  });

  describe('socket auth & rooms', () => {
    it('disconnects sockets that connect without a valid JWT', async () => {
      // The server may drop the socket before or right after the client-side
      // 'connect' event fires, so assert the end state instead of the event.
      const socket = io(baseUrl, {
        transports: ['websocket'],
        auth: {},
        reconnection: false,
      });
      openSockets.push(socket);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(socket.connected).toBe(false);
    });

    it('a non-member connects but receives no project events', async () => {
      const outsiderSocket = await connectSocket(outsiderToken);
      const memberSocket = await connectSocket(memberToken);

      const memberSaw = waitForEvent<SubmissionDto>(memberSocket, WS_EVENTS.submissionCreated);
      const outsiderSaw = receivedWithin(outsiderSocket, WS_EVENTS.submissionCreated, 800);

      await request(http)
        .post(`/projects/${projectId}/tasks/${taskId}/submissions`)
        .set(auth(ownerToken))
        .send({ comment: 'Room isolation check' })
        .expect(201);

      await memberSaw; // project member gets it...
      await expect(outsiderSaw).resolves.toBe(false); // ...non-member never does
    });
  });

  describe('live events', () => {
    it('submission:created reaches all project members live', async () => {
      const ownerSocket = await connectSocket(ownerToken);
      const memberSocket = await connectSocket(memberToken);

      const ownerSaw = waitForEvent<SubmissionDto>(ownerSocket, WS_EVENTS.submissionCreated);
      const memberSaw = waitForEvent<SubmissionDto>(memberSocket, WS_EVENTS.submissionCreated);

      const res = await request(http)
        .post(`/projects/${projectId}/tasks/${taskId}/submissions`)
        .set(auth(memberToken))
        .send({ comment: 'Second level done' })
        .expect(201);

      const [ownerPayload, memberPayload] = await Promise.all([ownerSaw, memberSaw]);
      expect(ownerPayload.id).toBe(res.body.id);
      expect(ownerPayload.comment).toBe('Second level done');
      expect(memberPayload.id).toBe(res.body.id);
    });

    it('task:updated reaches the room on a status change', async () => {
      const memberSocket = await connectSocket(memberToken);
      const saw = waitForEvent<TaskDto>(memberSocket, WS_EVENTS.taskUpdated);

      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskId}/status`)
        .set(auth(ownerToken))
        .send({ status: 'in_progress' })
        .expect(200);

      const payload = await saw;
      expect(payload.id).toBe(taskId);
      expect(payload.status).toBe('in_progress');
    });

    it('suggestion:created reaches owner sockets but NOT member sockets in the same room', async () => {
      const ownerSocket = await connectSocket(ownerToken);
      const memberSocket = await connectSocket(memberToken);

      const ownerSaw = waitForEvent<{ id: string }>(ownerSocket, WS_EVENTS.suggestionCreated);
      const memberSaw = receivedWithin(memberSocket, WS_EVENTS.suggestionCreated, 800);

      // Emit exactly as the Redis bridge does when the AI worker publishes.
      const realtime = app.get(RealtimeService);
      await realtime.emitSuggestionCreated(projectId, {
        id: 'sugg-live-1',
        projectId,
        taskId,
        relatedTaskIds: [taskId],
        triggeredBySubmissionId: null,
        suggestionType: 'blocker',
        summary: 'Scaffolding looks incomplete',
        detail: 'The latest photos show missing braces on level 2.',
        status: 'pending',
        reviewedById: null,
        reviewedAt: null,
        createdAt: new Date().toISOString(),
        reviewedBy: null,
      });

      await expect(ownerSaw).resolves.toMatchObject({ id: 'sugg-live-1' });
      await expect(memberSaw).resolves.toBe(false);
    });
  });

  describe('device tokens', () => {
    it('requires authentication', async () => {
      await request(http)
        .post('/users/me/device-tokens')
        .send({ expoPushToken: 'ExponentPushToken[abc]', platform: 'ios' })
        .expect(401);
    });

    it('registers a token and upserts on re-registration', async () => {
      const body = { expoPushToken: 'ExponentPushToken[member-1]', platform: 'ios' };

      const first = await request(http)
        .post('/users/me/device-tokens')
        .set(auth(memberToken))
        .send(body)
        .expect(201);
      expect(first.body.userId).toBe(memberId);

      // Same token again — no duplicate row.
      await request(http)
        .post('/users/me/device-tokens')
        .set(auth(memberToken))
        .send(body)
        .expect(201);
      const rows = await prisma.deviceToken.findMany({
        where: { expoPushToken: body.expoPushToken },
      });
      expect(rows).toHaveLength(1);
    });

    it('reassigns a token when another user logs in on the same device', async () => {
      const body = { expoPushToken: 'ExponentPushToken[shared-device]', platform: 'android' };

      await request(http)
        .post('/users/me/device-tokens')
        .set(auth(memberToken))
        .send(body)
        .expect(201);
      await request(http)
        .post('/users/me/device-tokens')
        .set(auth(outsiderToken))
        .send(body)
        .expect(201);

      const rows = await prisma.deviceToken.findMany({
        where: { expoPushToken: body.expoPushToken },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(outsiderId);
    });

    it('rejects unknown platforms', async () => {
      await request(http)
        .post('/users/me/device-tokens')
        .set(auth(memberToken))
        .send({ expoPushToken: 'ExponentPushToken[x]', platform: 'blackberry' })
        .expect(400);
    });
  });

  describe('notification triggers', () => {
    it('inviting a user queues an invite notification (email + push) with the right payload', async () => {
      const res = await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(ownerToken))
        .send({ email: 'fresh-invitee@example.com' })
        .expect(201);

      expect(notificationsMock.enqueue).toHaveBeenCalledTimes(1);
      expect(notificationsMock.enqueue).toHaveBeenCalledWith({
        kind: 'invite',
        projectId,
        invitedUserId: res.body.userId,
        inviterId: expect.any(String),
        email: 'fresh-invitee@example.com',
      });
    });

    it('the invite response does not wait on notification delivery', async () => {
      // A hanging queue must not hang the API: if invite() awaited enqueue,
      // this request would time out.
      notificationsMock.enqueue.mockReturnValue(new Promise(() => undefined));

      await request(http)
        .post(`/projects/${projectId}/invite`)
        .set(auth(ownerToken))
        .send({ email: 'another-invitee@example.com' })
        .expect(201);
    });

    it('marking a task blocked queues a push for all members — but only on a fresh block', async () => {
      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskId}/status`)
        .set(auth(memberToken))
        .send({ status: 'blocked' })
        .expect(200);

      expect(notificationsMock.enqueue).toHaveBeenCalledWith({
        kind: 'task-blocked',
        projectId,
        taskId,
        taskTitle: 'Erect scaffolding',
      });

      // Re-saving blocked → no second push.
      notificationsMock.enqueue.mockClear();
      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskId}/status`)
        .set(auth(memberToken))
        .send({ status: 'blocked' })
        .expect(200);
      expect(notificationsMock.enqueue).not.toHaveBeenCalled();

      await request(http)
        .patch(`/projects/${projectId}/tasks/${taskId}/status`)
        .set(auth(memberToken))
        .send({ status: 'in_progress' })
        .expect(200);
    });

    it('creating a submission queues a submission push (author excluded at send time)', async () => {
      const res = await request(http)
        .post(`/projects/${projectId}/tasks/${taskId}/submissions`)
        .set(auth(memberToken))
        .send({ comment: 'Push trigger check' })
        .expect(201);

      expect(notificationsMock.enqueue).toHaveBeenCalledWith({
        kind: 'submission',
        projectId,
        taskId,
        submissionId: res.body.id,
        authorId: memberId,
      });
    });
  });

  describe('invite landing page', () => {
    it('serves a public HTML page with the deep link', async () => {
      const res = await request(http)
        .get(`/invite?project=${projectId}&name=Tower%20build`)
        .expect(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain(`constructcoordinator://project/${projectId}`);
      expect(res.text).toContain('Tower build');
    });
  });
});
