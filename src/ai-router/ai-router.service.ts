import { Injectable } from '@nestjs/common';
// import { Queue } from 'bullmq';
// import { InjectQueue } from '@nestjs/bull';
import { PromptRequestDto } from './dto/prompt-request.dto';
import { AiResponseDto } from './dto/ai-response.dto';

@Injectable()
export class AiRouterService {
  constructor(
 // @InjectQueue('ai-processing') private aiQueue: Queue
  ) {}

  async processPrompt(
    promptRequest: PromptRequestDto,
  ): Promise<AiResponseDto | any> {
    // For now, return a mock response - queue processing disabled temporarily
    return {
      jobId: Math.random().toString(36).substr(2, 9),
      status: 'processing',
      message: 'Request queued for processing',
    };
  }
}
