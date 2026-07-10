import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  DEVICE_PLATFORMS,
  DevicePlatform,
  RegisterDeviceTokenRequest,
} from '@construct/shared';

export class RegisterDeviceTokenDto implements RegisterDeviceTokenRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  expoPushToken!: string;

  @IsIn(DEVICE_PLATFORMS)
  platform!: DevicePlatform;
}
