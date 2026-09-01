import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ByokService } from './byok.service';
import { BYOK_PROVIDERS, UpsertByokKeyDto } from './dto/upsert-byok-key.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { ProviderName } from '../ai-router/providers/ai-provider.interface';

@ApiTags('byok')
@ApiBearerAuth('JWT-auth')
@Controller('byok')
@UseGuards(AuthGuard('jwt'))
export class ByokController {
  constructor(private byokService: ByokService) {}

  @Get()
  @ApiOperation({
    summary: 'List connected keys',
    description:
      'Returns which providers have a key connected, with the last four characters as a hint. The key itself is never returned.',
  })
  @ApiResponse({ status: 200, description: 'Connected providers' })
  @ApiResponse({ status: 403, description: 'Anonymous users cannot use BYOK' })
  list(@CurrentUser() user: AuthUser) {
    return this.byokService.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Connect or replace a key',
    description:
      'Validates the key against the provider, then stores it encrypted. Replaces any existing key for that provider.',
  })
  @ApiResponse({ status: 201, description: 'Key stored' })
  @ApiResponse({ status: 400, description: 'The provider rejected the key' })
  @ApiResponse({ status: 403, description: 'Anonymous users cannot use BYOK' })
  @ApiResponse({
    status: 503,
    description: 'Server encryption key is not configured',
  })
  upsert(@Body() dto: UpsertByokKeyDto, @CurrentUser() user: AuthUser) {
    return this.byokService.upsert(user.id, dto.provider, dto.api_key);
  }

  @Delete(':provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect a key' })
  @ApiParam({ name: 'provider', enum: BYOK_PROVIDERS })
  @ApiResponse({ status: 204, description: 'Key removed' })
  @ApiResponse({
    status: 404,
    description: 'No key connected for that provider',
  })
  async remove(
    @Param('provider') provider: ProviderName,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.byokService.remove(user.id, provider);
  }
}
