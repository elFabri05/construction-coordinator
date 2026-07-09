import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  LONG_TEXT_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  UpdateTaskRequest,
} from '@construct/shared';

// Owner/superuser only. Status is intentionally absent — it has its own
// member-accessible endpoint.
export class UpdateTaskDto implements UpdateTaskRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(TASK_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sequenceOrder?: number;
}
