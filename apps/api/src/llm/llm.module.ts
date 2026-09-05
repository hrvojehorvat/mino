import { Module } from '@nestjs/common';
import { LlmClientService } from './llm-client.service.js';
import { LlmService } from './llm.service.js';

@Module({
  providers: [LlmClientService, LlmService],
  exports: [LlmService],
})
export class LlmModule {}
