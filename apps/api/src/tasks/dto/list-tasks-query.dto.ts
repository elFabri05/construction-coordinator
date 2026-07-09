import { IsIn, IsOptional } from 'class-validator';
import { TASK_STATUSES, TaskStatus } from '@construct/shared';

export class ListTasksQueryDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;
}
