import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET');
  }

  /** Returns the object key the body was written to. */
  async uploadFile(fileId: string, content: string): Promise<string> {
    const key = this.keyFor(fileId);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: Buffer.from(content, 'utf-8'),
        ContentType: 'text/plain',
      }),
    );

    return key;
  }

  async getFile(storageKey: string): Promise<string> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: storageKey }),
    );

    // The SDK's stream exposes transformToString in both Node and browser builds.
    return response.Body.transformToString();
  }

  keyFor(fileId: string): string {
    return `files/${fileId}`;
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });

      await this.s3Client.send(command);
    } catch (error) {
      // File might not exist in S3, which is fine
      console.warn(`Could not delete S3 object ${storageKey}:`, error.message);
    }
  }
}
