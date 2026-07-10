import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [MembershipsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
