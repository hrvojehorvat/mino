export type TestType =
  | "fingerTapping"
  | "reactionTime"
  | "targetTapping"
  | "fingerTracing"
  | "phoneStability"
  | "guidedMovement";

export type TouchEventType =
  | "touchDown"
  | "touchUp"
  | "stimulusShown"
  | "targetShown"
  | "touchMove";

export interface RawTouchEvent {
  seq: number;
  eventType: TouchEventType;
  tMs: number;
  // x/y are the touch position for touchDown/touchUp/touchMove, or the
  // target's spawn position for targetShown. pointerId is only meaningful
  // for touchDown/touchUp/touchMove.
  x?: number;
  y?: number;
  pointerId?: number;
}

// Reference path shown to the user for Finger Tracing, stored on
// TestSession.testParams since it's a static session parameter, not a
// timestamped event.
export interface FingerTracingParams {
  referencePath: { x: number; y: number }[];
}

// One sample of a continuous accelerometer/gyroscope stream (phone
// stability, guided movement). Stored as one JSON array per session
// (SensorSession) rather than as RawEvent rows — see decisions/0003.
export interface SensorSample {
  tMs: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export interface DeviceMetadata {
  os: string;
  osVersion: string;
  model: string;
}

export interface TestSessionSubmission {
  deviceId: string;
  // Every session belongs to a batch (see TestBatch) — even a batch of one
  // test. Created up front via POST /batches before the first session in it
  // is submitted.
  batchId: string;
  testType: TestType;
  startedAt: string;
  endedAt: string;
  clientAppVersion: string;
  deviceMetadata: DeviceMetadata;
  // Discrete touch/stimulus events — used by the row-per-event test types
  // (tapping, reaction time, target tapping, finger tracing). Omitted (or
  // empty) for sensor-only test types.
  events?: RawTouchEvent[];
  // Static per-session config that isn't itself a time-series (e.g.
  // Finger Tracing's reference path). Omitted for test types that don't
  // need it.
  testParams?: FingerTracingParams;
  // Continuous accelerometer/gyroscope stream — used only by sensor-based
  // test types (phone stability, guided movement).
  sensorSamples?: SensorSample[];
}

export interface TestSessionSubmissionResponse {
  id: string;
}

// A named, dated set of tests taken back-to-back in one run — see
// TestSession.batchId and apps/mobile's batch picker screen.
export interface TestBatchSubmission {
  deviceId: string;
  name?: string;
}

export interface TestBatchSubmissionResponse {
  id: string;
}

export interface TestBatchSummary {
  id: string;
  name: string | null;
  createdAt: string;
  sessionCount: number;
}

// Structured output of the Phase 3 ML service (services/ml) for one session
// — see MLResult in the Prisma schema. metrics' shape varies by test type.
export interface MLResultSummary {
  modelId: string;
  modelVersion: string;
  metrics: Record<string, unknown>;
  computedAt: string;
}

export interface TestBatchSessionDetail {
  id: string;
  testType: TestType;
  status: string;
  startedAt: string;
  // Null until the backend has computed a result for this session (on
  // demand or via its background sweep) — the app polls GET /batches/:id
  // again after a short delay until every session has a result (or gives
  // up after a bounded number of attempts).
  mlResult: MLResultSummary | null;
}

// Plain-language explanation of this batch's results, from the Phase 4 LLM
// service (services/llm-explain) — see LLMExplanation in the Prisma schema.
// Null until the user explicitly requests one (POST /batches/:id/explain);
// unlike mlResult, this is never generated automatically.
export interface LLMExplanationSummary {
  text: string;
  generatedAt: string;
}

export interface TestBatchDetail {
  id: string;
  name: string | null;
  createdAt: string;
  sessions: TestBatchSessionDetail[];
  llmExplanation: LLMExplanationSummary | null;
}
