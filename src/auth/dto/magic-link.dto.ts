import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestMagicLinkDto {
  @ApiProperty({
    description: 'Address to send the sign-in link to',
    example: 'nina@example.com',
  })
  @IsEmail()
  email: string;
}

export class ConsumeMagicLinkDto {
  @ApiProperty({
    description: 'The token from the emailed link',
    example: 'D8x1s7...',
  })
  @IsString()
  token: string;
}
