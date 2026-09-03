import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SensorSampleDto } from './dto/sensor-sample.dto.js';

/**
 * Isolated from SessionsService so a future storage-backend swap (e.g. to
 * Azure Blob, per decisions/0003) only touches this one method's internals.
 */
@Injectable()
export class SensorSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async storeSamples(sessionId: string, samples: SensorSampleDto[]): Promise<void> {
    await this.prisma.sensorSession.create({
      data: {
        sessionId,
        samples: samples as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
