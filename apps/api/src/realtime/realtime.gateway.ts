import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { projectRoom } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt.strategy';

/**
 * Socket.IO gateway. Clients authenticate on connect with the same JWT used
 * for REST (`io(url, { auth: { token } })`); unauthenticated sockets are
 * disconnected immediately.
 *
 * Room membership is re-derived from the Membership table on every connect —
 * never from anything the client sends. Sockets are pure delivery: no
 * server-side session state, so reconnects just run the same join logic
 * again.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) {
        throw new Error('missing token');
      }
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      if (payload.type === 'refresh') {
        throw new Error('refresh tokens cannot open sockets');
      }

      const memberships = await this.prisma.membership.findMany({
        where: { userId: payload.sub, status: 'active' },
        select: { projectId: true },
      });

      socket.data.userId = payload.sub;
      await socket.join(memberships.map((m) => projectRoom(m.projectId)));
    } catch (error) {
      this.logger.debug(
        `Rejected socket connection: ${error instanceof Error ? error.message : error}`,
      );
      socket.disconnect(true);
    }
  }
}
