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
exports.OpenAiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = require("openai");
let OpenAiService = class OpenAiService {
    constructor(configService) {
        this.configService = configService;
        this.openai = new openai_1.default({
            apiKey: this.configService.get('OPENAI_API_KEY'),
        });
    }
    async generateResponse(prompt, model = 'gpt-4') {
        try {
            const response = await this.openai.chat.completions.create({
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 1500,
            });
            return {
                response: response.choices[0]?.message?.content || 'No response generated',
                model_used: model,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error(`OpenAI API error: ${error.message}`);
        }
    }
    async generateWithContext(prompt, context, model = 'gpt-4') {
        const messages = [
            { role: 'system', content: context },
            { role: 'user', content: prompt },
        ];
        try {
            const response = await this.openai.chat.completions.create({
                model,
                messages,
                max_tokens: 1500,
            });
            return {
                response: response.choices[0]?.message?.content || 'No response generated',
                model_used: model,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error(`OpenAI API error: ${error.message}`);
        }
    }
};
exports.OpenAiService = OpenAiService;
exports.OpenAiService = OpenAiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], OpenAiService);
//# sourceMappingURL=openai.service.js.map