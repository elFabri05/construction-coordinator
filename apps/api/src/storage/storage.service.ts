import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Presigned PUT URLs are short-lived: the client should upload immediately.
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
// Read URLs live long enough for a feed session but are regenerated per
// request — only object keys are ever persisted.
const READ_URL_TTL_SECONDS = 60 * 60;

/**
 * Thin wrapper around an S3-compatible object store. Configured for
 * Cloudflare R2 by default (S3_ENDPOINT = https://<account>.r2.cloudflarestorage.com,
 * S3_REGION = auto), but nothing here is R2-specific — swapping to AWS S3 or
 * MinIO is purely an env-var change.
 *
 * Photo bytes NEVER pass through this API: clients PUT directly to the
 * presigned URL and reference the object key afterwards.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: config.get<string>('S3_REGION') ?? 'auto',
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') !== 'false',
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
  }

  getPresignedReadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: READ_URL_TTL_SECONDS },
    );
  }

  /**
   * Currently unused by submissions (soft delete keeps objects for the AI
   * audit trail), but part of the storage contract for future phases.
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
