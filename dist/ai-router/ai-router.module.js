"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiRouterModule = void 0;
const common_1 = require("@nestjs/common");
const ai_router_controller_1 = require("./ai-router.controller");
const ai_router_service_1 = require("./ai-router.service");
const openai_service_1 = require("./providers/openai.service");
const encryption_module_1 = require("../encryption/encryption.module");
const files_module_1 = require("../files/files.module");
const chat_module_1 = require("../chat/chat.module");
let AiRouterModule = class AiRouterModule {
};
exports.AiRouterModule = AiRouterModule;
exports.AiRouterModule = AiRouterModule = __decorate([
    (0, common_1.Module)({
        imports: [
            encryption_module_1.EncryptionModule,
            files_module_1.FilesModule,
            chat_module_1.ChatModule,
        ],
        controllers: [ai_router_controller_1.AiRouterController],
        providers: [ai_router_service_1.AiRouterService, openai_service_1.OpenAiService],
        exports: [ai_router_service_1.AiRouterService],
    })
], AiRouterModule);
//# sourceMappingURL=ai-router.module.js.map