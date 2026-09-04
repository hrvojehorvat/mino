import { Module } from '@nestjs/common';
import { MlModule } from '../ml/ml.module.js';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';

@Module({
  imports: [MlModule],
  controllers: [BatchesController],
  providers: [BatchesService],
})
export class BatchesModule {}
