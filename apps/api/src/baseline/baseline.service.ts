import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MODEL_ID as ML_MODEL_ID,
  MODEL_VERSION as ML_MODEL_VERSION,
} from '../ml/ml.constants.js';
import { BaselineClientService } from './baseline-client.service.js';
import { MODEL_ID, MODEL_VERSION } from './baseline.constants.js';

const CURRENT_ML_RESULT = { modelId: ML_MODEL_ID, modelVersion: ML_MODEL_VERSION };

/** Compares one session's MLResult against that same user's own history of
 * past MLResults for the same test type, and saves the result — the only
 * thing in this system that reads/writes BaselineResult. Mirrors MlService's
 * shape: triggered on demand only (see BatchesService.findOneForDevice), no
 * background sweep — nothing yet depends on this existing before someone
 * views the batch. See docs/decisions/0006-ml-trigger-mechanism.md and the
 * BaselineResult model's comment in schema.prisma. */
@Injectable()
export class BaselineService {
  private readonly logger = new Logger(BaselineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly baselineClient: BaselineClientService,
  ) {}

  async computePendingForBatch(batchId: string): Promise<void> {
    const sessions = await this.prisma.testSession.findMany({
      where: {
        batchId,
        mlResults: {
          some: {
            ...CURRENT_ML_RESULT,
            baselineResults: { none: { modelId: MODEL_ID, modelVersion: MODEL_VERSION } },
          },
        },
      },
      include: {
        mlResults: { where: CURRENT_ML_RESULT, take: 1 },
      },
    });

    if (sessions.length === 0) {
      return;
    }

    await Promise.all(sessions.map((session) => this.computeAndSave(session)));
  }

  private async computeAndSave(session: {
    id: string;
    userId: string;
    testType: string;
    mlResults: { id: string; metrics: Prisma.JsonValue }[];
  }): Promise<void> {
    const currentResult = session.mlResults[0];
    if (!currentResult) {
      return;
    }

    const history = await this.prisma.testSession.findMany({
      where: {
        userId: session.userId,
        testType: session.testType as never,
        id: { not: session.id },
        mlResults: { some: CURRENT_ML_RESULT },
      },
      orderBy: { startedAt: 'asc' },
      include: {
        mlResults: { where: CURRENT_ML_RESULT, take: 1 },
      },
    });

    let result: { sampleSize: number; metrics: Record<string, unknown> };
    try {
      result = await this.baselineClient.computeBaseline(
        history.map((h) => h.mlResults[0].metrics as Record<string, unknown>),
        currentResult.metrics as Record<string, unknown>,
      );
    } catch (err) {
      this.logger.warn(
        `baseline compute failed for session ${session.id}: ${(err as Error).message}`,
      );
      return;
    }

    try {
      await this.prisma.baselineResult.create({
        data: {
          mlResultId: currentResult.id,
          modelId: MODEL_ID,
          modelVersion: MODEL_VERSION,
          baselineSampleSize: result.sampleSize,
          metrics: result.metrics as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Unique violation: same race as MlService.computeAndSave's P2002
      // handling — harmless no-op instead of a crash.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      throw err;
    }
  }
}
