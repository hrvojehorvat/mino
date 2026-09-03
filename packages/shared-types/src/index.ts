export type TestType = "fingerTapping" | "reactionTime" | "targetTapping";

export type TouchEventType =
  | "touchDown"
  | "touchUp"
  | "stimulusShown"
  | "targetShown";

export interface RawTouchEvent {
  seq: number;
  eventType: TouchEventType;
  tMs: number;
  // x/y are the touch position for touchDown/touchUp, or the target's
  // spawn position for targetShown. pointerId is only meaningful for
  // touchDown/touchUp.
  x?: number;
  y?: number;
  pointerId?: number;
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
}

export interface TestSessionSubmissionResponse {
  id: string;
}
