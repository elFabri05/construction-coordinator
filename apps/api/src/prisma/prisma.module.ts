import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global so guards (e.g. ProjectRoleGuard) can inject PrismaService from any module.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
