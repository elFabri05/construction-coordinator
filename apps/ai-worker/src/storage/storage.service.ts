import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Read-side storage access for the worker. Uses the same S3_* configuration
 * as apps/api's StorageService, but reads object bytes directly (server-side
 * GetObject) instead of minting signed URLs — the bytes are needed anyway to
 * pass photos to Claude as base64 image content blocks, and a direct read
 * works even when the store isn't reachable from the public internet (e.g.
 * local MinIO).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
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

  /** Returns null (and logs) when the object can't be fetched — a missing
   *  photo degrades the review context, it doesn't abort the review. */
  async getObjectBase64(key: string): Promise<string | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) {
        return null;
      }
      return Buffer.from(bytes).toString('base64');
    } catch (error) {
      this.logger.warn(
        `Could not fetch object ${key}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }
}
