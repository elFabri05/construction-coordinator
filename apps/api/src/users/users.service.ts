import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { UserDto } from '@construct/shared';
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
