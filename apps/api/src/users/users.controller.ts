import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { DeviceTokenDto } from '@construct/shared';
import { UsersService } from './users.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';

@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Registers this device for push notifications. Idempotent (upsert on the
   * token): calling it on every app start / token refresh is the intended
   * usage. A token previously owned by another user (shared device) is
   * reassigned to the caller.
   */
  @Post('device-tokens')
  @UseGuards(JwtAuthGuard)
  registerDeviceToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterDeviceTokenDto,
  ): Promise<DeviceTokenDto> {
    return this.users.registerDeviceToken(user.id, dto);
  }
}
