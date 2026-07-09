import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { LoginRequest } from '@construct/shared';

export class LoginDto implements LoginRequest {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
