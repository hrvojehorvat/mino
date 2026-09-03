import { useRef, useState } from 'react';
import * as Device from 'expo-device';
import type {
  FingerTracingParams,
  RawTouchEvent,
  TestSessionSubmission,
  TestType,
  TouchEventType,
} from '@mino/shared-types';
import { API_BASE_URL, CLIENT_APP_VERSION } from './config';
import { getOrCreateDeviceId } from './deviceId';

export type TestSessionState =
  | 'idle'
  | 'running'
  | 'submitting'
  | 'done'
  | 'error';

interface UseTestSessionOptions {
  testType: TestType;
  /** If provided, the session auto-ends via a countdown when it reaches 0. */
  durationMs?: number;
  /** Static per-session config submitted alongside the raw events, if any. */
  testParams?: FingerTracingParams;
}

interface PushEventExtra {
  x?: number;
  y?: number;
  pointerId?: number;
}

/**
 * Shared idle/running/submitting/done/error state machine used by every
 * test screen: tracks captured events, builds the submission payload, and
 * posts it to the API. Test-specific capture UI lives in each screen.
 */
export function useTestSession({
  testType,
  durationMs,
  testParams,
}: UseTestSessionOptions) {
  const [state, setState] = useState<TestSessionState>('idle');
  const [secondsLeft, setSecondsLeft] = useState(
    durationMs ? durationMs / 1000 : 0,
  );
  const [eventCount, setEventCount] = useState(0);

  const sessionStartRef = useRef<number>(0);
  const eventsRef = useRef<RawTouchEvent[]>([]);
  const seqRef = useRef(0);
  const startedAtRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    eventsRef.current = [];
    seqRef.current = 0;
    sessionStartRef.current = performance.now();
    startedAtRef.current = new Date().toISOString();
    setEventCount(0);
    setState('running');

    if (durationMs) {
      setSecondsLeft(durationMs / 1000);
      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            void endSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const pushEvent = (eventType: TouchEventType, extra?: PushEventExtra) => {
    if (state !== 'running') return;
    eventsRef.current.push({
      seq: seqRef.current++,
      eventType,
      tMs: Math.round(performance.now() - sessionStartRef.current),
      ...extra,
    });
    setEventCount(eventsRef.current.length);
  };

  const endSession = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState('submitting');
    const endedAt = new Date().toISOString();

    try {
      const deviceId = await getOrCreateDeviceId();
      const payload: TestSessionSubmission = {
        deviceId,
        testType,
        startedAt: startedAtRef.current,
        endedAt,
        clientAppVersion: CLIENT_APP_VERSION,
        deviceMetadata: {
          os: Device.osName ?? 'unknown',
          osVersion: Device.osVersion ?? 'unknown',
          model: Device.modelName ?? 'unknown',
        },
        events: eventsRef.current,
        ...(testParams ? { testParams } : {}),
      };

      const response = await fetch(`${API_BASE_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Submission failed with status ${response.status}`);
      }

      setState('done');
    } catch {
      setState('error');
    }
  };

  return { state, secondsLeft, eventCount, start, pushEvent, endSession };
}
