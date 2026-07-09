import { IsNotEmpty, IsString } from 'class-validator';
import { RefreshRequest } from '@construct/shared';

export class RefreshTokenDto implements RefreshRequest {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
