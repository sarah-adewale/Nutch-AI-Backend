import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';

@ApiTags('files')
@ApiBearerAuth('JWT-auth')
@Controller('files')
@UseGuards(AuthGuard('jwt'))
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get user files',
    description:
      'Returns all files owned by the authenticated user, organized by folder',
  })
  @ApiResponse({
    status: 200,
    description: 'Files retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'file123' },
          filename: { type: 'string', example: 'fibonacci.js' },
          folder: { type: 'string', example: '/code' },
          fileType: { type: 'string', example: 'js' },
          createdAt: { type: 'string', example: '2023-11-28T10:30:00.000Z' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserFiles(@CurrentUser() user: AuthUser) {
    return this.filesService.getUserFiles(user.id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete file',
    description: 'Delete a specific file owned by the authenticated user',
  })
  @ApiParam({ name: 'id', description: 'File ID to delete' })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async deleteFile(@Param('id') fileId: string, @CurrentUser() user: AuthUser) {
    return this.filesService.deleteFile(user.id, fileId);
  }
}
