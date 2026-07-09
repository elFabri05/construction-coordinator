import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import {
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RegisterRequest,
} from '@construct/shared';

export class RegisterDto implements RegisterRequest {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name: string;
}
