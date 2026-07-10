import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { NotificationsQueueService } from './notifications-queue.service';
import { NotificationsProcessor } from './notifications.processor';
import { ExpoPushService } from './expo-push.service';

@Module({
  imports: [EmailModule],
  providers: [NotificationsQueueService, NotificationsProcessor, ExpoPushService],
  exports: [NotificationsQueueService],
})
export class NotificationsModule {}
