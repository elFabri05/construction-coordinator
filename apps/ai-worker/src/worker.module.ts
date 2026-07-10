import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { PromptBuilderModule } from './prompt-builder/prompt-builder.module';
import { ClaudeClientModule } from './claude-client/claude-client.module';
import { ResultWriterModule } from './result-writer/result-writer.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    PromptBuilderModule,
    ClaudeClientModule,
    ResultWriterModule,
    QueueModule,
  ],
})
export class WorkerModule {}
