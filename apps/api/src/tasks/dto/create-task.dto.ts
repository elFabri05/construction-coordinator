import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CreateTaskRequest,
  LONG_TEXT_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
} from '@construct/shared';

export class CreateTaskDto implements CreateTaskRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TASK_TITLE_MAX_LENGTH)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  description?: string;
}
