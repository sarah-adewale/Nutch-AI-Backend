import { Controller, Get, Post, UseGuards, Req, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';

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
}
