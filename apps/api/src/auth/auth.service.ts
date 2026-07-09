import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthResponseDto } from '@construct/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing && existing.passwordHash !== null) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    let user: User;
    if (existing) {
      // Placeholder created by an invite: claim it and activate the
      // memberships that were waiting on registration.
      user = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.user.update({
          where: { id: existing.id },
          data: { passwordHash, name: dto.name },
        });
        await tx.membership.updateMany({
          where: { userId: claimed.id, status: 'invited' },
          data: { status: 'active' },
        });
        return claimed;
      });
    } else {
      user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash, name: dto.name },
      });
    }

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.passwordHash === null) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.users.findById(payload.sub);
    if (!user || user.passwordHash === null) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User): Promise<AuthResponseDto> {
    const payload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL,
      }),
      this.jwt.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: REFRESH_TOKEN_TTL,
        },
      ),
    ]);

    return { user: this.users.toDto(user), accessToken, refreshToken };
  }
}
