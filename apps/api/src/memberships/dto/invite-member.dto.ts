import { IsEmail, IsIn, IsOptional } from 'class-validator';
import {
  ASSIGNABLE_ROLES,
  AssignableRole,
  InviteMemberRequest,
} from '@construct/shared';

export class InviteMemberDto implements InviteMemberRequest {
  @IsEmail()
  email: string;

  // 'owner' is deliberately not accepted — it can never be granted.
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: AssignableRole;
}
