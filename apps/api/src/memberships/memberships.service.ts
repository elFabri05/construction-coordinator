import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Membership, Prisma, User } from '@prisma/client';
import { AssignableRole, MemberDto } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationsQueueService } from '../notifications/notifications-queue.service';

type MembershipWithUser = Membership & {
  user: Pick<User, 'id' | 'email' | 'name'>;
};

const memberInclude = {
  user: { select: { id: true, email: true, name: true } },
} as const;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsQueueService,
  ) {}

  /**
   * Invites a user by email. If no account exists yet, a placeholder User is
   * created and the membership starts as `invited` (activated when they
   * register). Existing users become `active` members immediately — there is
   * no accept flow in this phase.
   */
  async invite(
    projectId: string,
    inviterId: string,
    email: string,
    role: AssignableRole = 'member',
  ): Promise<MemberDto> {
    let user = await this.users.findByEmail(email);
    let status: 'invited' | 'active' = 'active';

    if (!user) {
      user = await this.users.createPlaceholder(email);
      status = 'invited';
    }

    let membership: MembershipWithUser;
    try {
      membership = await this.prisma.membership.create({
        data: {
          projectId,
          userId: user.id,
          role,
          status,
          invitedById: inviterId,
        },
        include: memberInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User is already a member of this project');
      }
      throw error;
    }

    // Real invite email (+ push if they already have the app), queued so the
    // invite response never waits on the email provider. Fire-and-forget:
    // enqueue() logs failures internally and never throws.
    void this.notifications.enqueue({
      kind: 'invite',
      projectId,
      invitedUserId: user.id,
      inviterId,
      email,
    });

    return this.toDto(membership);
  }

  async listMembers(projectId: string): Promise<MemberDto[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { projectId },
      include: memberInclude,
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => this.toDto(m));
  }

  /**
   * Changes a member's role. Only `superuser` and `member` are assignable
   * (enforced by the DTO); the owner's membership can never be touched, so a
   * project can never end up without an owner.
   */
  async changeRole(
    projectId: string,
    targetUserId: string,
    role: AssignableRole,
  ): Promise<MemberDto> {
    const target = await this.prisma.membership.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    if (!target) {
      throw new NotFoundException('This user is not a member of the project');
    }
    if (target.role === 'owner') {
      throw new ForbiddenException('The owner role cannot be changed');
    }

    const updated = await this.prisma.membership.update({
      where: { id: target.id },
      data: { role },
      include: memberInclude,
    });

    return this.toDto(updated);
  }

  private toDto(membership: MembershipWithUser): MemberDto {
    return {
      id: membership.id,
      projectId: membership.projectId,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
      invitedById: membership.invitedById,
      createdAt: membership.createdAt.toISOString(),
      user: membership.user,
    };
  }
}
