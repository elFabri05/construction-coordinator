import { Module } from '@nestjs/common';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { StorageModule } from '../storage/storage.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [StorageModule, QueueModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
