import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CreateProjectRequest, PROJECT_NAME_MAX_LENGTH } from '@construct/shared';

export class CreateProjectDto implements CreateProjectRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROJECT_NAME_MAX_LENGTH)
  name: string;

  @IsString()
  @IsNotEmpty()
  goal: string;
}
