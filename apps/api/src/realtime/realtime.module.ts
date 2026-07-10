import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { RealtimeBridgeService } from './realtime-bridge.service';

@Module({
  // Secret is passed explicitly on verify (same pattern as AuthService).
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeService, RealtimeBridgeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
