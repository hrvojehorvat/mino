import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SensorSessionsService } from './sensor-sessions.service.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SessionsController],
  providers: [SessionsService, SensorSessionsService],
})
export class SessionsModule {}
