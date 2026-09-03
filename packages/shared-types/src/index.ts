export type TestType =
  | "fingerTapping"
  | "reactionTime"
  | "targetTapping"
  | "fingerTracing";

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

export interface DeviceMetadata {
  os: string;
  osVersion: string;
  model: string;
}

export interface TestSessionSubmission {
  deviceId: string;
  testType: TestType;
  startedAt: string;
  endedAt: string;
  clientAppVersion: string;
  deviceMetadata: DeviceMetadata;
  events: RawTouchEvent[];
  // Static per-session config that isn't itself a time-series (e.g.
  // Finger Tracing's reference path). Omitted for test types that don't
  // need it.
  testParams?: FingerTracingParams;
}

export interface TestSessionSubmissionResponse {
  id: string;
}
