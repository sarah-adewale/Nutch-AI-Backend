import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MigrateAnonymousDto {
  @ApiProperty({
    description:
      'The anonymous session token held before signing in. Its chat sessions and files move to the signed-in account.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  anonymous_token: string;
}
