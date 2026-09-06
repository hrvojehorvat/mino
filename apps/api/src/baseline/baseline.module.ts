import { Module } from '@nestjs/common';
import { BaselineClientService } from './baseline-client.service.js';
import { BaselineService } from './baseline.service.js';

@Module({
  providers: [BaselineClientService, BaselineService],
  exports: [BaselineService],
})
export class BaselineModule {}
