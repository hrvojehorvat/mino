import { Injectable, NotFoundException } from '@nestjs/common';
import { TestType as PrismaTestType } from '@prisma/client';
import type { TestType } from '@mino/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { BaselineService } from '../baseline/baseline.service.js';
import { LlmService, LLMExplanationSummary } from '../llm/llm.service.js';
import { MlService } from '../ml/ml.service.js';
import { CreateTestBatchDto } from './dto/create-test-batch.dto.js';

export interface TestBatchSummary {
  id: string;
  name: string | null;
  createdAt: string;
  sessionCount: number;
}

export interface MLResultSummary {
  modelId: string;
  modelVersion: string;
  metrics: Record<string, unknown>;
  computedAt: string;
}

export interface BaselineMetricSummary {
  value: number;
  baselineMean: number;
  baselineSd: number;
  zScore: number;
  isAnomalous: boolean;
  favorable: boolean | null;
}

export interface BaselineResultSummary {
  sampleSize: number;
  metrics: Record<string, BaselineMetricSummary>;
}

export interface TestBatchSessionDetail {
  id: string;
  testType: TestType;
  status: string;
  startedAt: string;
  mlResult: MLResultSummary | null;
  baseline: BaselineResultSummary | null;
}

export interface TestBatchDetail {
  id: string;
  name: string | null;
  createdAt: string;
  sessions: TestBatchSessionDetail[];
  llmExplanation: LLMExplanationSummary | null;
}

const testTypeFromPrisma: Record<PrismaTestType, TestType> = {
  [PrismaTestType.FingerTapping]: 'fingerTapping',
  [PrismaTestType.ReactionTime]: 'reactionTime',
  [PrismaTestType.TargetTapping]: 'targetTapping',
  [PrismaTestType.FingerTracing]: 'fingerTracing',
  [PrismaTestType.PhoneStability]: 'phoneStability',
  [PrismaTestType.GuidedMovement]: 'guidedMovement',
};

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mlService: MlService,
    private readonly llmService: LlmService,
    private readonly baselineService: BaselineService,
  ) {}

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

  async findOneForDevice(
    id: string,
    deviceId: string,
  ): Promise<TestBatchDetail> {
    let detail = await this.loadDetail(id, deviceId);

    if (detail.sessions.some((s) => s.mlResult === null)) {
      // A background sweep also picks up pending sessions (see MlService),
      // but a user looking at this screen right now shouldn't wait out that
      // interval — compute this batch's pending sessions immediately.
      await this.mlService.computePendingForBatch(id);
      detail = await this.loadDetail(id, deviceId);
    }

    if (detail.sessions.some((s) => s.mlResult !== null && s.baseline === null)) {
      await this.baselineService.computePendingForBatch(id);
      detail = await this.loadDetail(id, deviceId);
    }

    return detail;
  }

  async explainForDevice(
    id: string,
    deviceId: string,
  ): Promise<LLMExplanationSummary> {
    const user = await this.prisma.user.findUnique({ where: { deviceId } });
    const batch = user
      ? await this.prisma.testBatch.findUnique({ where: { id } })
      : null;

    if (!batch || batch.userId !== user?.id) {
      throw new NotFoundException('batch not found');
    }

    return this.llmService.generateExplanation(id);
  }

  private async loadDetail(
    id: string,
    deviceId: string,
  ): Promise<TestBatchDetail> {
    const user = await this.prisma.user.findUnique({ where: { deviceId } });

    const batch = user
      ? await this.prisma.testBatch.findUnique({
          where: { id },
          include: {
            sessions: {
              orderBy: { startedAt: 'asc' },
              include: {
                mlResults: {
                  orderBy: { computedAt: 'desc' },
                  take: 1,
                  include: {
                    baselineResults: {
                      orderBy: { computedAt: 'desc' },
                      take: 1,
                    },
                  },
                },
              },
            },
            explanations: {
              orderBy: { generatedAt: 'desc' },
              take: 1,
            },
          },
        })
      : null;

    if (!batch || batch.userId !== user?.id) {
      throw new NotFoundException('batch not found');
    }

    const [llmExplanation] = batch.explanations;

    return {
      id: batch.id,
      name: batch.name,
      createdAt: batch.createdAt.toISOString(),
      llmExplanation: llmExplanation
        ? {
            text: llmExplanation.explanationText,
            generatedAt: llmExplanation.generatedAt.toISOString(),
          }
        : null,
      sessions: batch.sessions.map((session) => {
        const [mlResult] = session.mlResults;
        const [baseline] = mlResult?.baselineResults ?? [];

        return {
          id: session.id,
          testType: testTypeFromPrisma[session.testType],
          status: session.status,
          startedAt: session.startedAt.toISOString(),
          mlResult: mlResult
            ? {
                modelId: mlResult.modelId,
                modelVersion: mlResult.modelVersion,
                metrics: mlResult.metrics as Record<string, unknown>,
                computedAt: mlResult.computedAt.toISOString(),
              }
            : null,
          baseline: baseline
            ? {
                sampleSize: baseline.baselineSampleSize,
                metrics: baseline.metrics as unknown as Record<
                  string,
                  BaselineMetricSummary
                >,
              }
            : null,
        };
      }),
    };
  }
}
