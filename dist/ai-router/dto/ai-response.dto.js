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
exports.RedirectResponseDto = exports.AiResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AiResponseDto {
}
exports.AiResponseDto = AiResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'The AI-generated response',
        example: 'Here is a function to calculate fibonacci numbers:\n\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}',
    }),
    __metadata("design:type", String)
], AiResponseDto.prototype, "response", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'The AI model that generated the response',
        example: 'gpt-4',
    }),
    __metadata("design:type", String)
], AiResponseDto.prototype, "model_used", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Timestamp when the response was generated',
        example: '2023-11-28T10:30:00.000Z',
    }),
    __metadata("design:type", String)
], AiResponseDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'File type for automatic organization',
        example: 'js',
    }),
    __metadata("design:type", String)
], AiResponseDto.prototype, "file_type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Folder for automatic organization',
        example: '/code',
        enum: ['/code', '/documents'],
    }),
    __metadata("design:type", String)
], AiResponseDto.prototype, "folder", void 0);
class RedirectResponseDto {
}
exports.RedirectResponseDto = RedirectResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Indicates this is a redirect response',
        example: true,
    }),
    __metadata("design:type", Boolean)
], RedirectResponseDto.prototype, "redirect", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Recommended external tool',
        example: 'midjourney',
    }),
    __metadata("design:type", String)
], RedirectResponseDto.prototype, "tool", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Reason for the redirect',
        example: 'Image generation is not supported by this model',
    }),
    __metadata("design:type", String)
], RedirectResponseDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Pre-filled query for the external tool',
        example: 'Create a fantasy-style illustration of...',
    }),
    __metadata("design:type", String)
], RedirectResponseDto.prototype, "pre_fill", void 0);
//# sourceMappingURL=ai-response.dto.js.map