import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  imports: [StorageModule],
  providers: [PromptBuilderService],
  exports: [PromptBuilderService],
})
export class PromptBuilderModule {}
