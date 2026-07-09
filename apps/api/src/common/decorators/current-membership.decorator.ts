import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Membership } from '@prisma/client';

/**
 * The caller's membership in the project, as attached to the request by
 * ProjectRoleGuard. Only valid on routes protected with @RequireRole(...).
 */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Membership => {
    const request = ctx.switchToHttp().getRequest();
    return request.membership;
  },
);
