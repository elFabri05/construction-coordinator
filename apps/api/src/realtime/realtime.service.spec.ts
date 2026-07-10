import { AiSuggestionDto, WS_EVENTS } from '@construct/shared';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';

const suggestion = {
  id: 'sugg-1',
  projectId: 'proj-1',
  summary: 'Something looks off',
} as AiSuggestionDto;

function makeRemoteSocket(userId: string) {
  return { data: { userId }, emit: jest.fn() };
}

function makeService(options: {
  managers: string[]; // userIds with owner/superuser role
  socketsInRoom: ReturnType<typeof makeRemoteSocket>[];
}) {
  const fetchSockets = jest.fn().mockResolvedValue(options.socketsInRoom);
  const inRoom = jest.fn().mockReturnValue({ fetchSockets });
  const gateway = {
    server: { in: inRoom, to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
  } as unknown as RealtimeGateway;
  const prisma = {
    membership: {
      findMany: jest
        .fn()
        .mockResolvedValue(options.managers.map((userId) => ({ userId }))),
    },
  } as unknown as PrismaService;
  return { service: new RealtimeService(gateway, prisma), prisma, inRoom };
}

describe('RealtimeService suggestion role filtering', () => {
  it('emits suggestion:created to owner/superuser sockets but NOT member sockets in the same room', async () => {
    const ownerSocket = makeRemoteSocket('owner-1');
    const superuserSocket = makeRemoteSocket('super-1');
    const memberSocket = makeRemoteSocket('member-1');

    const { service, prisma, inRoom } = makeService({
      managers: ['owner-1', 'super-1'],
      socketsInRoom: [ownerSocket, superuserSocket, memberSocket],
    });

    await service.emitSuggestionCreated('proj-1', suggestion);

    expect(inRoom).toHaveBeenCalledWith('project:proj-1');
    // Roles are re-checked against the DB at emit time.
    expect(
      (prisma.membership.findMany as jest.Mock).mock.calls[0][0].where,
    ).toEqual({
      projectId: 'proj-1',
      status: 'active',
      role: { in: ['owner', 'superuser'] },
    });

    expect(ownerSocket.emit).toHaveBeenCalledWith(
      WS_EVENTS.suggestionCreated,
      suggestion,
    );
    expect(superuserSocket.emit).toHaveBeenCalledWith(
      WS_EVENTS.suggestionCreated,
      suggestion,
    );
    expect(memberSocket.emit).not.toHaveBeenCalled();
  });

  it('a socket whose user was demoted after connecting no longer receives suggestions', async () => {
    // demoted-1 is IN the room (joined while superuser) but the DB now says member.
    const demotedSocket = makeRemoteSocket('demoted-1');
    const { service } = makeService({
      managers: ['owner-1'],
      socketsInRoom: [demotedSocket],
    });

    await service.emitSuggestionCreated('proj-1', suggestion);

    expect(demotedSocket.emit).not.toHaveBeenCalled();
  });

  it('never throws when the socket server is unavailable', async () => {
    const gateway = { server: undefined } as unknown as RealtimeGateway;
    const prisma = {} as PrismaService;
    const service = new RealtimeService(gateway, prisma);

    await expect(
      service.emitSuggestionCreated('proj-1', suggestion),
    ).resolves.toBeUndefined();
    expect(() => service.emitTaskUpdated('proj-1', {} as never)).not.toThrow();
  });
});
