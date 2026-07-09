import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { ReorderTasksRequest } from '@construct/shared';

export class ReorderTasksDto implements ReorderTasksRequest {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  taskIds: string[];
}
