export type TestType = "fingerTapping" | "reactionTime";

export type TouchEventType = "touchDown" | "touchUp" | "stimulusShown";

export interface RawTouchEvent {
  seq: number;
  eventType: TouchEventType;
  tMs: number;
  // x/y/pointerId are only meaningful for touchDown/touchUp events.
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
