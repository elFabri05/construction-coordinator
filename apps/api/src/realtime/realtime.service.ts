import { Injectable, Logger } from '@nestjs/common';
import {
  AiSuggestionDto,
  SubmissionDto,
  TaskDto,
  WS_EVENTS,
  projectRoom,
} from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Thin emission facade injected into feature services after successful DB
 * writes. Realtime is a side effect, never business logic: every method
 * swallows and logs failures so a broken socket layer can't fail a write.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly prisma: PrismaService,
  ) {}

  emitSubmissionCreated(projectId: string, submission: SubmissionDto): void {
    this.emitToRoom(projectId, WS_EVENTS.submissionCreated, submission);
  }

  emitTaskUpdated(projectId: string, task: TaskDto): void {
    this.emitToRoom(projectId, WS_EVENTS.taskUpdated, task);
  }

  /**
   * Role-filtered: everyone in the room is a project member, but only
   * owner/superuser sockets may see AI suggestions. Roles are re-checked
   * against the DB at emit time (not connect time), so a member promoted
   * after connecting starts receiving these without reconnecting — and a
   * demoted superuser stops.
   */
  async emitSuggestionCreated(
    projectId: string,
    suggestion: AiSuggestionDto,
  ): Promise<void> {
    try {
      const server = this.gateway.server;
      if (!server) {
        return;
      }
      const managers = await this.prisma.membership.findMany({
        where: {
          projectId,
          status: 'active',
          role: { in: ['owner', 'superuser'] },
        },
        select: { userId: true },
      });
      const allowed = new Set(managers.map((m) => m.userId));

      const sockets = await server.in(projectRoom(projectId)).fetchSockets();
      for (const socket of sockets) {
        if (allowed.has(socket.data.userId)) {
          socket.emit(WS_EVENTS.suggestionCreated, suggestion);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to emit suggestion:created for project ${projectId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private emitToRoom(projectId: string, event: string, payload: unknown): void {
    try {
      this.gateway.server?.to(projectRoom(projectId)).emit(event, payload);
    } catch (error) {
      this.logger.warn(
        `Failed to emit ${event} for project ${projectId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
