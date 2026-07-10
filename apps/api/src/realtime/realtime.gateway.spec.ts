import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';

const SECRET = 'unit-test-secret';

function makeSocket(token?: unknown) {
  return {
    handshake: { auth: { token } },
    data: {} as Record<string, unknown>,
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

function makeGateway(memberships: { projectId: string }[]) {
  const prisma = {
    membership: { findMany: jest.fn().mockResolvedValue(memberships) },
  } as unknown as PrismaService;
  const config = { getOrThrow: jest.fn().mockReturnValue(SECRET) } as unknown as ConfigService;
  const gateway = new RealtimeGateway(new JwtService({}), config, prisma);
  return { gateway, prisma };
}

const jwt = new JwtService({});
const signedToken = (payload: object) => jwt.sign(payload, { secret: SECRET });

describe('RealtimeGateway room joining', () => {
  it('joins one room per ACTIVE membership, derived from the DB', async () => {
    const { gateway, prisma } = makeGateway([
      { projectId: 'proj-1' },
      { projectId: 'proj-2' },
    ]);
    const socket = makeSocket(signedToken({ sub: 'user-1', email: 'a@b.c' }));

    await gateway.handleConnection(socket as never);

    // Rooms come from the Membership table for THIS user, active only —
    // nothing the client sent is trusted.
    expect(
      (prisma.membership.findMany as jest.Mock).mock.calls[0][0].where,
    ).toEqual({ userId: 'user-1', status: 'active' });
    expect(socket.join).toHaveBeenCalledWith(['project:proj-1', 'project:proj-2']);
    expect(socket.data.userId).toBe('user-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('a user with no memberships joins no rooms (but stays connected)', async () => {
    const { gateway } = makeGateway([]);
    const socket = makeSocket(signedToken({ sub: 'user-2', email: 'x@y.z' }));

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith([]);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects sockets without a token', async () => {
    const { gateway } = makeGateway([{ projectId: 'proj-1' }]);
    const socket = makeSocket(undefined);

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects sockets with an invalid or forged token', async () => {
    const { gateway } = makeGateway([{ projectId: 'proj-1' }]);
    const forged = new JwtService({}).sign(
      { sub: 'user-1', email: 'a@b.c' },
      { secret: 'wrong-secret' },
    );
    const socket = makeSocket(forged);

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rejects refresh tokens — only access tokens may open sockets', async () => {
    const { gateway } = makeGateway([{ projectId: 'proj-1' }]);
    const socket = makeSocket(
      signedToken({ sub: 'user-1', email: 'a@b.c', type: 'refresh' }),
    );

    await gateway.handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});
