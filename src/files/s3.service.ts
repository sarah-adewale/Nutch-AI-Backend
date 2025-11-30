import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
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

  async uploadFile(fileId: string, content: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: `files/${fileId}`,
      Body: Buffer.from(content, 'utf-8'),
      ContentType: 'text/plain',
    });

    await this.s3Client.send(command);
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: `files/${fileId}`,
      });

      await this.s3Client.send(command);
    } catch (error) {
      // File might not exist in S3, which is fine
      console.warn(`Could not delete S3 file ${fileId}:`, error.message);
    }
  }
}
