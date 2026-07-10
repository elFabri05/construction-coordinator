import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { InvitePageController } from './invite-page.controller';

@Module({
  controllers: [InvitePageController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
