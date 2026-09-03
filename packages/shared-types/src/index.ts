export type TestType = "fingerTapping";

export type TouchEventType = "touchDown" | "touchUp";

export interface RawTouchEvent {
  seq: number;
  eventType: TouchEventType;
  tMs: number;
  x: number;
  y: number;
  pointerId: number;
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
