import { Injectable } from '@nestjs/common';

const LLM_SERVICE_URL =
  process.env.LLM_SERVICE_URL ?? 'http://localhost:5002';
// Generous relative to ml-client's 5s: a scaled-to-zero Modal GPU container
// can take real time to load model weights on a cold start, on top of
// actual generation time. See decisions/0007-llm-hosting-and-guardrail.md.
const EXPLAIN_TIMEOUT_MS = 60_000;

export interface ExplainSession {
  testType: string;
  metrics: Record<string, unknown>;
}

export interface ExplainRequest {
  sessions: ExplainSession[];
  batchName: string | null;
}

export type ExplainResult =
  | { ok: true; explanationText: string }
  | { ok: false; reason: string };

/** Thin HTTP client for services/llm-explain — a stateless Flask endpoint
 * (deployed on Modal) that turns a batch's MLResult metrics into a
 * plain-language explanation. No DB access on either side of this call. */
@Injectable()
export class LlmClientService {
  async explain(request: ExplainRequest): Promise<ExplainResult> {
    const response = await fetch(`${LLM_SERVICE_URL}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(EXPLAIN_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `services/llm-explain responded ${response.status}: ${await response.text()}`,
      );
    }

    return (await response.json()) as ExplainResult;
  }
}
