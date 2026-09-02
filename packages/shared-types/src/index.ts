export type TestType = "finger_tapping";

export type TouchEventType = "touch_down" | "touch_up";

export interface RawTouchEvent {
  seq: number;
  event_type: TouchEventType;
  t_ms: number;
  x: number;
  y: number;
  pointer_id: number;
}

export interface DeviceMetadata {
  os: string;
  os_version: string;
  model: string;
}

export interface TestSessionSubmission {
  test_type: TestType;
  started_at: string;
  ended_at: string;
  client_app_version: string;
  device_metadata: DeviceMetadata;
  events: RawTouchEvent[];
}
