import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@construct/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PROJECT_ROLES_KEY } from '../decorators/require-role.decorator';

/**
 * Project-scoped RBAC guard. Must run after JwtAuthGuard (request.user set).
 *
 * On success it attaches the caller's membership to `request.membership` so
 * handlers can reuse it without a second query.
 */
@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      this.reflector.getAllAndOverride<MembershipRole[]>(PROJECT_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const projectId: string | undefined =
      request.params?.id ?? request.params?.projectId;

    if (!user || !projectId) {
      throw new ForbiddenException();
    }

    const membership = await this.prisma.membership.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });

    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException('You are not a member of this project');
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    request.membership = membership;
    return true;
  }
}
