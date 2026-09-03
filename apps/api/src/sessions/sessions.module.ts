import { Module } from '@nestjs/common';
import { SensorSessionsService } from './sensor-sessions.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  controllers: [SessionsController],
  providers: [SessionsService, SensorSessionsService],
})
export class SessionsModule {}
