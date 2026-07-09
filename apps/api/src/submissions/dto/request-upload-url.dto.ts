import { IsIn, IsOptional } from 'class-validator';
import {
  RequestUploadUrlRequest,
  UPLOAD_CONTENT_TYPES,
  UploadContentType,
} from '@construct/shared';

export class RequestUploadUrlDto implements RequestUploadUrlRequest {
  @IsOptional()
  @IsIn(UPLOAD_CONTENT_TYPES)
  contentType?: UploadContentType;
}
