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
exports.AiProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const bullmq_1 = require("bullmq");
let AiProcessor = class AiProcessor {
    async handleAiRequest(job) {
        console.log('Processing AI request:', job.data);
        return {
            response: 'This is a placeholder response',
            model_used: job.data.model,
            timestamp: new Date().toISOString(),
            file_type: 'txt',
            folder: '/documents',
        };
    }
};
exports.AiProcessor = AiProcessor;
__decorate([
    (0, bull_1.Process)('process-ai-request'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_1.Job]),
    __metadata("design:returntype", Promise)
], AiProcessor.prototype, "handleAiRequest", null);
exports.AiProcessor = AiProcessor = __decorate([
    (0, bull_1.Processor)('ai-processing')
], AiProcessor);
//# sourceMappingURL=ai.processor.js.map