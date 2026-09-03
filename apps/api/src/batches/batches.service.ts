import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTestBatchDto } from './dto/create-test-batch.dto.js';

export interface TestBatchSummary {
  id: string;
  name: string | null;
  createdAt: string;
  sessionCount: number;
}

@Injectable()
export class BatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTestBatchDto): Promise<{ id: string }> {
    const user = await this.prisma.user.upsert({
      where: { deviceId: dto.deviceId },
      create: { deviceId: dto.deviceId },
      update: {},
    });

    const batch = await this.prisma.testBatch.create({
      data: {
        userId: user.id,
        name: dto.name,
      },
    });

    return { id: batch.id };
  }

  async findAllForDevice(deviceId: string): Promise<TestBatchSummary[]> {
    const user = await this.prisma.user.findUnique({ where: { deviceId } });
    if (!user) {
      return [];
    }

    const batches = await this.prisma.testBatch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { sessions: true } } },
    });

    return batches.map((batch) => ({
      id: batch.id,
      name: batch.name,
      createdAt: batch.createdAt.toISOString(),
      sessionCount: batch._count.sessions,
    }));
  }
}
