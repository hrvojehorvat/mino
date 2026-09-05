import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmClientService } from './llm-client.service.js';
import { MODEL_ID, MODEL_VERSION } from './llm.constants.js';

export interface LLMExplanationSummary {
  text: string;
  generatedAt: string;
}

const UNIQUE_KEY = { modelId: MODEL_ID, modelVersion: MODEL_VERSION };

/** Generates a plain-language explanation for one batch's already-computed
 * MLResult metrics, via services/llm-explain, and persists it — the only
 * thing in this system that reads/writes LLMExplanation. Unlike MlService,
 * there is no background sweep: generating an explanation costs real
 * compute, so it only happens when a user explicitly asks for one (see
 * BatchesController's POST /batches/:id/explain). See
 * docs/decisions/0007-llm-hosting-and-guardrail.md.
 */
@Injectable()
export class LlmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmClient: LlmClientService,
  ) {}

  async generateExplanation(batchId: string): Promise<LLMExplanationSummary> {
    const existing = await this.prisma.lLMExplanation.findUnique({
      where: { batchId_modelId_modelVersion: { batchId, ...UNIQUE_KEY } },
    });
    if (existing) {
      return this.toSummary(existing);
    }

    const batch = await this.prisma.testBatch.findUnique({
      where: { id: batchId },
      include: {
        sessions: {
          include: { mlResults: { orderBy: { computedAt: 'desc' }, take: 1 } },
        },
      },
    });
    if (!batch) {
      throw new NotFoundException('batch not found');
    }

    const sessions = batch.sessions.map((session) => ({
      testType: session.testType,
      result: session.mlResults[0] ?? null,
    }));
    if (sessions.length === 0 || sessions.some((s) => s.result === null)) {
      throw new UnprocessableEntityException(
        'batch has sessions with no ML result yet',
      );
    }

    const outcome = await this.llmClient.explain({
      sessions: sessions.map((s) => ({
        testType: s.testType,
        metrics: s.result!.metrics as Record<string, unknown>,
      })),
      batchName: batch.name,
    });

    if (!outcome.ok) {
      throw new UnprocessableEntityException(
        `could not generate an explanation: ${outcome.reason}`,
      );
    }

    try {
      const created = await this.prisma.lLMExplanation.create({
        data: {
          batchId,
          ...UNIQUE_KEY,
          explanationText: outcome.explanationText,
        },
      });
      return this.toSummary(created);
    } catch (err) {
      // Unique violation: a second concurrent explain request for the same
      // batch beat this one to the write — return its result instead of
      // erroring, same idiom as MlService.computeAndSave's P2002 handling.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const race = await this.prisma.lLMExplanation.findUniqueOrThrow({
          where: { batchId_modelId_modelVersion: { batchId, ...UNIQUE_KEY } },
        });
        return this.toSummary(race);
      }
      throw err;
    }
  }

  private toSummary(row: {
    explanationText: string;
    generatedAt: Date;
  }): LLMExplanationSummary {
    return { text: row.explanationText, generatedAt: row.generatedAt.toISOString() };
  }
}
