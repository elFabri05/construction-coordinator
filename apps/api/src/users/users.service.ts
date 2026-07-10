import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { DeviceTokenDto, RegisterDeviceTokenRequest, UserDto } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Creates a user record for someone invited by email who has not registered
   * yet. `passwordHash: null` marks it as a placeholder; registering with the
   * same email later claims the account (sets password + real name).
   */
  createPlaceholder(email: string): Promise<User> {
    return this.prisma.user.create({
      data: {
        email,
        passwordHash: null,
        name: email.split('@')[0],
      },
    });
  }

  /** Upsert on the token value: re-registration and device hand-over are both no-drama. */
  async registerDeviceToken(
    userId: string,
    dto: RegisterDeviceTokenRequest,
  ): Promise<DeviceTokenDto> {
    const token = await this.prisma.deviceToken.upsert({
      where: { expoPushToken: dto.expoPushToken },
      update: { userId, platform: dto.platform },
      create: { userId, expoPushToken: dto.expoPushToken, platform: dto.platform },
    });
    return {
      id: token.id,
      userId: token.userId,
      expoPushToken: token.expoPushToken,
      platform: token.platform,
      createdAt: token.createdAt.toISOString(),
    };
  }

  /** Strips passwordHash and serializes dates for API responses. */
  toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
