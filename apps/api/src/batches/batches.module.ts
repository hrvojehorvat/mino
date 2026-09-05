import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { MlModule } from '../ml/ml.module.js';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';

@Module({
  imports: [MlModule, LlmModule],
  controllers: [BatchesController],
  providers: [BatchesService],
})
export class BatchesModule {}
