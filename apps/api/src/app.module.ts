import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { MembershipsModule } from './memberships/memberships.module';
import { GuidelinesModule } from './guidelines/guidelines.module';
import { TasksModule } from './tasks/tasks.module';
import { StorageModule } from './storage/storage.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { QueueModule } from './queue/queue.module';
import { AiSuggestionsModule } from './ai-suggestions/ai-suggestions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    MembershipsModule,
    GuidelinesModule,
    TasksModule,
    StorageModule,
    SubmissionsModule,
    QueueModule,
    AiSuggestionsModule,
  ],
})
export class AppModule {}
