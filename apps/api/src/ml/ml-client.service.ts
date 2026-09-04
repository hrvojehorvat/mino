import { Injectable } from '@nestjs/common';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:5001';
const COMPUTE_TIMEOUT_MS = 5_000;

export interface ComputeRequest {
  testType: string;
  rawEvents: Record<string, unknown>[];
  sensorSamples: Record<string, unknown>[] | null;
  testParams: Record<string, unknown> | null;
}

/** Thin HTTP client for services/ml — a stateless Flask endpoint that turns
 * one session's raw data into metrics. No DB access on either side of this
 * call; see docs/decisions/0006-ml-trigger-mechanism.md (Update 3). */
@Injectable()
export class MlClientService {
  async computeMetrics(
    request: ComputeRequest,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${ML_SERVICE_URL}/compute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(COMPUTE_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `services/ml responded ${response.status}: ${await response.text()}`,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
