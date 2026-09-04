import { Module } from '@nestjs/common';
import { MlClientService } from './ml-client.service.js';
import { MlService } from './ml.service.js';

@Module({
  providers: [MlClientService, MlService],
  exports: [MlService],
})
export class MlModule {}
