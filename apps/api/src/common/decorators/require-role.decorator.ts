import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@construct/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ProjectRoleGuard } from '../guards/project-role.guard';

export const PROJECT_ROLES_KEY = 'project_roles';

/**
 * Protects a route with JWT auth + project-scoped role enforcement.
 *
 * Reads the project id from the `:id` (or `:projectId`) route param, looks up
 * the caller's ACTIVE membership in that project and throws 403 if it is
 * missing or its role is not in `roles`. Call with no arguments to require
 * any active membership regardless of role.
 *
 * Reused by every project-scoped module (tasks, guidelines, uploads will use
 * it in later phases):
 *
 *   @RequireRole('owner', 'superuser')
 *   @Post('invite')
 *   invite(...) {}
 */
export function RequireRole(...roles: MembershipRole[]) {
  return applyDecorators(
    SetMetadata(PROJECT_ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, ProjectRoleGuard),
  );
}
