import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { PushNotificationData } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sends Expo push notifications to every registered device of the given
 * users. Tokens that Expo reports as dead (DeviceNotRegistered) are deleted
 * so we stop pushing into the void.
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);
  private readonly expo = new Expo();

  constructor(private readonly prisma: PrismaService) {}

  async sendToUsers(
    userIds: string[],
    notification: { title: string; body: string; data: PushNotificationData },
  ): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
    });
    const valid = tokens.filter((t) => Expo.isExpoPushToken(t.expoPushToken));
    if (valid.length === 0) {
      return;
    }

    const messages: ExpoPushMessage[] = valid.map((t) => ({
      to: t.expoPushToken,
      sound: 'default' as const,
      title: notification.title,
      body: notification.body,
      data: { ...notification.data } as Record<string, unknown>,
    }));

    const deadTokens: string[] = [];
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      const tickets = await this.expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, index) => {
        if (
          ticket.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered'
        ) {
          deadTokens.push(chunk[index].to as string);
        }
      });
    }

    if (deadTokens.length > 0) {
      await this.prisma.deviceToken.deleteMany({
        where: { expoPushToken: { in: deadTokens } },
      });
      this.logger.log(`Removed ${deadTokens.length} dead device token(s)`);
    }
  }
}
