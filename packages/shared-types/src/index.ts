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
