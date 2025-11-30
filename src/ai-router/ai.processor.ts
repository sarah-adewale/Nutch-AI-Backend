import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { PromptRequestDto } from './dto/prompt-request.dto';

@Processor('ai-processing')
export class AiProcessor {
  @Process('process-ai-request')
  async handleAiRequest(job: Job<PromptRequestDto>) {
    console.log('Processing AI request:', job.data);

    // TODO: Implement actual AI processing
    // This is a placeholder for the actual AI processing logic

    return {
      response: 'This is a placeholder response',
      model_used: job.data.model,
      timestamp: new Date().toISOString(),
      file_type: 'txt',
      folder: '/documents',
    };
  }
}
