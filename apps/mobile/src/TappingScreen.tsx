import { useRef, useState } from 'react';
import {
  GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import * as Device from 'expo-device';
import type { RawTouchEvent, TestSessionSubmission } from '@mino/shared-types';
import { API_BASE_URL, CLIENT_APP_VERSION, SESSION_DURATION_MS } from './config';
import { getOrCreateDeviceId } from './deviceId';

type ScreenState = 'idle' | 'running' | 'submitting' | 'done' | 'error';

export default function TappingScreen() {
  const [state, setState] = useState<ScreenState>('idle');
  const [secondsLeft, setSecondsLeft] = useState(SESSION_DURATION_MS / 1000);
  const [eventCount, setEventCount] = useState(0);

  const sessionStartRef = useRef<number>(0);
  const eventsRef = useRef<RawTouchEvent[]>([]);
  const seqRef = useRef(0);
  const startedAtRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSession = () => {
    eventsRef.current = [];
    seqRef.current = 0;
    sessionStartRef.current = performance.now();
    startedAtRef.current = new Date().toISOString();
    setEventCount(0);
    setSecondsLeft(SESSION_DURATION_MS / 1000);
    setState('running');

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
  };

  const recordTouch = (eventType: 'touchDown' | 'touchUp') => (
    e: GestureResponderEvent,
  ) => {
    if (state !== 'running') return;
    eventsRef.current.push({
      seq: seqRef.current++,
      eventType,
      tMs: Math.round(performance.now() - sessionStartRef.current),
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      pointerId: Number(e.nativeEvent.identifier),
    });
    setEventCount(eventsRef.current.length);
  };

  const endSession = async () => {
    setState('submitting');
    const endedAt = new Date().toISOString();

    try {
      const deviceId = await getOrCreateDeviceId();
      const payload: TestSessionSubmission = {
        deviceId,
        testType: 'fingerTapping',
        startedAt: startedAtRef.current,
        endedAt,
        clientAppVersion: CLIENT_APP_VERSION,
        deviceMetadata: {
          os: Device.osName ?? 'unknown',
          osVersion: Device.osVersion ?? 'unknown',
          model: Device.modelName ?? 'unknown',
        },
        events: eventsRef.current,
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

  if (state === 'idle') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Finger Tapping Test</Text>
        <Text style={styles.subtitle}>
          Tap the circle as fast as you can for {SESSION_DURATION_MS / 1000}{' '}
          seconds.
        </Text>
        <TouchableWithoutFeedback onPress={startSession}>
          <View style={styles.startButton}>
            <Text style={styles.startButtonText}>Start</Text>
          </View>
        </TouchableWithoutFeedback>
      </View>
    );
  }

  if (state === 'running') {
    return (
      <View style={styles.container}>
        <Text style={styles.timer}>{secondsLeft}s</Text>
        <Text style={styles.subtitle}>Taps: {eventCount}</Text>
        <View
          style={styles.target}
          onTouchStart={recordTouch('touchDown')}
          onTouchEnd={recordTouch('touchUp')}
        />
      </View>
    );
  }

  if (state === 'submitting') {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Submitting...</Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Submission failed</Text>
        <Text style={styles.subtitle}>Check your connection and try again.</Text>
        <TouchableWithoutFeedback onPress={startSession}>
          <View style={styles.startButton}>
            <Text style={styles.startButtonText}>Try again</Text>
          </View>
        </TouchableWithoutFeedback>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Session complete</Text>
      <Text style={styles.subtitle}>{eventCount} events captured</Text>
      <TouchableWithoutFeedback onPress={startSession}>
        <View style={styles.startButton}>
          <Text style={styles.startButtonText}>Run again</Text>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 16,
    color: '#444',
    textAlign: 'center',
  },
  timer: {
    fontSize: 48,
    fontWeight: '700',
  },
  target: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#3b82f6',
  },
  startButton: {
    backgroundColor: '#111',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
