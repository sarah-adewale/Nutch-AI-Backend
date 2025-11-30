"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const s3_service_1 = require("./s3.service");
let FilesService = class FilesService {
    constructor(prisma, s3Service) {
        this.prisma = prisma;
        this.s3Service = s3Service;
    }
    async createFile(userId, filename, content, fileType) {
        const folder = this.determineFolder(fileType);
        const file = await this.prisma.file.create({
            data: {
                userId,
                filename,
                content,
                fileType,
                folder,
            },
        });
        if (content.length > 1024 * 100) {
            await this.s3Service.uploadFile(file.id, content);
        }
        return file;
    }
    determineFolder(fileType) {
        const codeTypes = [
            'js',
            'ts',
            'py',
            'java',
            'cpp',
            'html',
            'css',
            'json',
            'xml',
        ];
        return codeTypes.includes(fileType.toLowerCase()) ? '/code' : '/documents';
    }
    async getUserFiles(userId) {
        return this.prisma.file.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async deleteFile(userId, fileId) {
        const file = await this.prisma.file.findFirst({
            where: { id: fileId, userId },
        });
        if (!file) {
            throw new Error('File not found');
        }
        await this.prisma.file.delete({
            where: { id: fileId },
        });
        await this.s3Service.deleteFile(fileId);
        return { success: true };
    }
};
exports.FilesService = FilesService;
exports.FilesService = FilesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        s3_service_1.S3Service])
], FilesService);
//# sourceMappingURL=files.service.js.map