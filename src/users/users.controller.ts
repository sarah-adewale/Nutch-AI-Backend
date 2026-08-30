import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { LimitsService } from '../limits/limits.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(
    private usersService: UsersService,
    private limits: LimitsService,
  ) {}

  @Get('profile')
  @ApiOperation({
    summary: 'Get user profile',
    description:
      'Returns user profile with usage statistics and account limits',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'cmi8tb6tv0000rdimxbtp39do' },
        email: { type: 'string', example: 'user@example.com', nullable: true },
        authProvider: { type: 'string', example: 'google', nullable: true },
        subscriptionTier: { type: 'string', example: 'free' },
        isAnonymous: { type: 'boolean', example: false },
        chatSessionCount: { type: 'number', example: 5 },
        fileCount: { type: 'number', example: 12 },
        limits: {
          type: 'object',
          properties: {
            maxChatSessions: {
              type: 'number',
              example: -1,
              description: '-1 means unlimited',
            },
            maxFiles: {
              type: 'number',
              example: -1,
              description: '-1 means unlimited',
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: AuthUser) {
    const userProfile = await this.usersService.findById(user.id);
    const isAnonymous = await this.usersService.isAnonymous(user.id);
    const chatSessionCount = await this.usersService.getUserChatSessionCount(
      user.id,
    );
    const fileCount = await this.usersService.getUserFileCount(user.id);

    return {
      ...userProfile,
      isAnonymous,
      chatSessionCount,
      fileCount,
      // Read from the same service that enforces them, so the reported
      // numbers cannot drift from the numbers actually applied.
      limits: this.limits.limitsFor(isAnonymous),
    };
  }
}
