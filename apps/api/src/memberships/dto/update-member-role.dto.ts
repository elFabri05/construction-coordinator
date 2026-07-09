import { IsIn } from 'class-validator';
import {
  ASSIGNABLE_ROLES,
  AssignableRole,
  UpdateMemberRoleRequest,
} from '@construct/shared';

export class UpdateMemberRoleDto implements UpdateMemberRoleRequest {
  // Only member<->superuser transitions exist; 'owner' is rejected here.
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;
}
