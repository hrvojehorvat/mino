import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, SessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MlClientService } from './ml-client.service.js';
import { MODEL_ID, MODEL_VERSION } from './ml.constants.js';

// How many sessions the background sweep computes at once — bounded so a
// large backlog (e.g. after services/ml was down for a while) doesn't fire
// hundreds of simultaneous HTTP calls.
const SWEEP_CONCURRENCY = 5;

const PENDING_SESSION_INCLUDE = {
  events: { orderBy: { seq: 'asc' as const } },
  sensorSession: true,
};

type PendingSession = Prisma.TestSessionGetPayload<{
  include: typeof PENDING_SESSION_INCLUDE;
}>;

/** Finds sessions with no result yet, computes them via services/ml, and
 * saves the result — the only thing in this system that reads/writes
 * MLResult. Triggered two ways: on demand (a batch detail view, scoped to
 * that batch) and by a background sweep (system-wide, for sessions nobody
 * has viewed yet). See docs/decisions/0006-ml-trigger-mechanism.md
 * (Update 3) for why there's no message broker in between.
 */
@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mlClient: MlClientService,
  ) {}

  async computePendingForBatch(batchId: string): Promise<void> {
    const sessions = await this.prisma.testSession.findMany({
      where: { batchId, ...this.pendingWhere() },
      include: PENDING_SESSION_INCLUDE,
    });

    await Promise.all(sessions.map((session) => this.computeAndSave(session)));
  }

  @Cron('*/30 * * * * *')
  async sweepPending(): Promise<void> {
    // Disabled under e2e tests: each spec's beforeEach spins up a fresh app
    // (and cron registration) around a live shared DB, and the wall-clock
    // aligned schedule can otherwise fire mid-test — see .env.test.
    if (process.env.DISABLE_ML_SWEEP === 'true') {
      return;
    }

    const sessions = await this.prisma.testSession.findMany({
      where: this.pendingWhere(),
      include: PENDING_SESSION_INCLUDE,
    });

    for (let i = 0; i < sessions.length; i += SWEEP_CONCURRENCY) {
      const chunk = sessions.slice(i, i + SWEEP_CONCURRENCY);
      await Promise.all(chunk.map((session) => this.computeAndSave(session)));
    }
  }

  private pendingWhere(): Prisma.TestSessionWhereInput {
    return {
      status: SessionStatus.Completed,
      mlResults: { none: { modelId: MODEL_ID, modelVersion: MODEL_VERSION } },
    };
  }

  private async computeAndSave(session: PendingSession): Promise<void> {
    let metrics: Record<string, unknown>;
    try {
      metrics = await this.mlClient.computeMetrics({
        testType: session.testType,
        rawEvents: session.events.map((e) => ({
          seq: e.seq,
          eventType: e.eventType,
          tMs: e.tMs,
          x: e.x,
          y: e.y,
          pointerId: e.pointerId,
        })),
        sensorSamples: (session.sensorSession?.samples as
          | Record<string, unknown>[]
          | null) ?? null,
        testParams: session.testParams as Record<string, unknown> | null,
      });
    } catch (err) {
      this.logger.warn(
        `compute failed for session ${session.id}: ${(err as Error).message}`,
      );
      return;
    }

    try {
      await this.prisma.mLResult.create({
        data: {
          sessionId: session.id,
          modelId: MODEL_ID,
          modelVersion: MODEL_VERSION,
          metrics: metrics as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Unique violation: the on-demand path and the background sweep both
      // picked up the same session in the small window before either
      // committed — the (sessionId, modelId, modelVersion) constraint makes
      // the second write a harmless no-op instead of a crash.
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
