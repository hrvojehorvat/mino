import { Injectable } from '@nestjs/common';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:5001';
const BASELINE_TIMEOUT_MS = 5_000;

export interface BaselineMetric {
  value: number;
  baselineMean: number;
  baselineSd: number;
  zScore: number;
  isAnomalous: boolean;
}

export interface BaselineResponse {
  sampleSize: number;
  metrics: Record<string, BaselineMetric>;
}

/** Thin HTTP client for services/ml's /baseline endpoint — same stateless,
 * no-DB-access service /compute already uses (see
 * docs/decisions/0006-ml-trigger-mechanism.md, Update 3). */
@Injectable()
export class BaselineClientService {
  async computeBaseline(
    history: Record<string, unknown>[],
    current: Record<string, unknown>,
  ): Promise<BaselineResponse> {
    const response = await fetch(`${ML_SERVICE_URL}/baseline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, current }),
      signal: AbortSignal.timeout(BASELINE_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `services/ml responded ${response.status}: ${await response.text()}`,
      );
    }

    return (await response.json()) as BaselineResponse;
  }
}
