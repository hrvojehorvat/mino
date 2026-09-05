import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BatchesModule } from './batches/batches.module.js';
import { LlmModule } from './llm/llm.module.js';
import { MlModule } from './ml/ml.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SessionsModule } from './sessions/sessions.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    MlModule,
    LlmModule,
    BatchesModule,
    SessionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
