import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  CreateSubmissionRequest,
  SUBMISSION_COMMENT_MAX_LENGTH,
} from '@construct/shared';

@ValidatorConstraint({ name: 'commentOrPhoto' })
class CommentOrPhotoConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateSubmissionDto;
    return Boolean(dto.comment?.trim() || dto.photoKey);
  }

  defaultMessage(): string {
    return 'At least one of comment or photoKey must be provided';
  }
}

export class CreateSubmissionDto implements CreateSubmissionRequest {
  // The ValidateIf makes the constraint run when comment is present OR when
  // photoKey is absent — i.e. the empty-body case still gets validated.
  @ValidateIf((o: CreateSubmissionDto) => o.comment !== undefined || o.photoKey === undefined)
  @Validate(CommentOrPhotoConstraint)
  @IsString()
  @MaxLength(SUBMISSION_COMMENT_MAX_LENGTH)
  comment?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  photoKey?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  thumbnailKey?: string;
}
