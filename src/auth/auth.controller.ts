import {
  Body,
  Controller,
  Get,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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
