import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { BatchesModule } from './batches/batches.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SessionsModule } from './sessions/sessions.module.js';

@Module({
  imports: [PrismaModule, BatchesModule, SessionsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
