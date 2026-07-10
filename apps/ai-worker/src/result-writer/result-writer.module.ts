import { Module } from '@nestjs/common';
import { ResultWriterService } from './result-writer.service';

@Module({
  providers: [ResultWriterService],
  exports: [ResultWriterService],
})
export class ResultWriterModule {}
