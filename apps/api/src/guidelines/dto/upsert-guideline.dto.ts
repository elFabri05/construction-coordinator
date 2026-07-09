import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LONG_TEXT_MAX_LENGTH, UpsertGuidelineRequest } from '@construct/shared';

export class UpsertGuidelineDto implements UpsertGuidelineRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  content: string;
}
