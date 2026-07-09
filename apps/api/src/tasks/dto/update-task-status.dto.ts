import { IsIn } from 'class-validator';
import {
  TASK_STATUSES,
  TaskStatus,
  UpdateTaskStatusRequest,
} from '@construct/shared';

// The ONLY field accepted on the member-accessible status route.
export class UpdateTaskStatusDto implements UpdateTaskStatusRequest {
  @IsIn(TASK_STATUSES)
  status: TaskStatus;
}
