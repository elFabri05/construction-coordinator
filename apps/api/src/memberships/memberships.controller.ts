import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { MemberDto } from '@construct/shared';
import { MembershipsService } from './memberships.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireRole } from '../common/decorators/require-role.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('projects/:id')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Post('invite')
  @RequireRole('owner', 'superuser')
  invite(
    @Param('id') projectId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
  ): Promise<MemberDto> {
    return this.memberships.invite(projectId, user.id, dto.email, dto.role);
  }

  @Get('members')
  @RequireRole()
  list(@Param('id') projectId: string): Promise<MemberDto[]> {
    return this.memberships.listMembers(projectId);
  }

  @Patch('members/:userId')
  @RequireRole('owner')
  changeRole(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<MemberDto> {
    return this.memberships.changeRole(projectId, userId, dto.role);
  }
}
