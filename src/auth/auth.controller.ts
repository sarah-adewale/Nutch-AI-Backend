import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard as PassportGuard } from '@nestjs/passport';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeEndpoint,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService, AuthUser } from './auth.service';
import { MigrateAnonymousDto } from './dto/migrate-anonymous.dto';
import { ConsumeMagicLinkDto, RequestMagicLinkDto } from './dto/magic-link.dto';
import { MagicLinkService } from './magic-link/magic-link.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private magicLinkService: MagicLinkService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirects to Google OAuth' })
  async googleAuth() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.login(req.user);
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/success?token=${result.access_token}`,
    );
  }

  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Initiate GitHub OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirects to GitHub OAuth' })
  async githubAuth() {
    // Guard redirects to GitHub
  }

  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiExcludeEndpoint()
  async githubAuthCallback(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.login(req.user);
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/success?token=${result.access_token}`,
    );
  }

  @Post('anonymous')
  @ApiOperation({
    summary: 'Create anonymous user session',
    description:
      'Creates a temporary anonymous user with limited access (3 chat sessions, 5 files max)',
  })
  @ApiResponse({
    status: 201,
    description: 'Anonymous user created successfully',
    schema: {
      type: 'object',
      properties: {
        access_token: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cmi8tb6tv0000rdimxbtp39do' },
          },
        },
      },
    },
  })
  async createAnonymousSession() {
    return this.authService.createAnonymousUser();
  }

  @Post('magic-link')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a sign-in link',
    description:
      'Emails a single-use link. Always returns 202, whether or not the address has an account, so the endpoint cannot be used to discover who is registered.',
  })
  @ApiResponse({
    status: 202,
    description: 'Link sent if the address is valid',
  })
  async requestMagicLink(@Body() dto: RequestMagicLinkDto) {
    await this.magicLinkService.request(dto.email);
    return {
      message: 'If that address can receive mail, a link is on its way.',
    };
  }

  @Post('magic-link/verify')
  @ApiOperation({
    summary: 'Exchange a sign-in link for a token',
    description:
      'Consumes the token from the emailed link and returns a JWT. Tokens are single use.',
  })
  @ApiResponse({ status: 201, description: 'Signed in' })
  @ApiResponse({ status: 400, description: 'Link is invalid, expired or used' })
  async verifyMagicLink(@Body() dto: ConsumeMagicLinkDto) {
    const email = this.magicLinkService.consume(dto.token);
    return this.authService.loginWithEmail(email);
  }

  @Post('migrate-anonymous')
  @UseGuards(PassportGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Move an anonymous session onto the signed-in account',
    description:
      'Call after signing in, with the anonymous token held beforehand. Its chat sessions and files transfer to the authenticated account and the anonymous user is removed.',
  })
  @ApiResponse({
    status: 201,
    description: 'Migration completed',
    schema: {
      type: 'object',
      properties: {
        migratedSessions: { type: 'number', example: 3 },
        migratedFiles: { type: 'number', example: 2 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or unusable token' })
  @ApiResponse({
    status: 403,
    description: 'Token does not belong to an anonymous account',
  })
  async migrateAnonymous(
    @Body() dto: MigrateAnonymousDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.authService.migrateAnonymousAccount(
      user.id,
      dto.anonymous_token,
    );
  }
}
