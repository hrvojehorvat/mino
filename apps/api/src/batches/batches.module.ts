import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BaselineModule } from '../baseline/baseline.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { MlModule } from '../ml/ml.module.js';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';

@Module({
  imports: [AuthModule, MlModule, LlmModule, BaselineModule],
  controllers: [BatchesController],
  providers: [BatchesService],
})
export class BatchesModule {}
