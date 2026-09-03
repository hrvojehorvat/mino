import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { useTestSession } from './useTestSession';

const HOLD_DURATION_MS = 10000;
const SENSOR_UPDATE_INTERVAL_MS = 20; // ~50Hz

type SensorsStatus = 'checking' | 'available' | 'unavailable';

export default function PhoneStabilityScreen() {
  const { state, secondsLeft, start, pushSensorSample, endSession } =
    useTestSession({
      testType: 'phoneStability',
      durationMs: HOLD_DURATION_MS,
    });

  // This test needs both accelerometer and gyroscope data to be meaningful —
  // checked up front so we can disable Start with an explanation rather than
  // silently recording a partial/degraded session.
  const [sensorsStatus, setSensorsStatus] = useState<SensorsStatus>('checking');

  useEffect(() => {
    // expo-sensors' web shim unreliably reports availability (isAvailableAsync
    // can resolve true even though setUpdateInterval/addListener then fail) —
    // Mino is a mobile app, so treat web as always unavailable for this test
    // rather than trusting that shim.
    if (Platform.OS === 'web') {
      setSensorsStatus('unavailable');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [accelAvailable, gyroAvailable] = await Promise.all([
          Accelerometer.isAvailableAsync(),
          Gyroscope.isAvailableAsync(),
        ]);
        if (!cancelled) {
          setSensorsStatus(accelAvailable && gyroAvailable ? 'available' : 'unavailable');
        }
      } catch {
        if (!cancelled) setSensorsStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== 'running') return;

    let accelSub: { remove: () => void } | null = null;
    let gyroSub: { remove: () => void } | null = null;
    let latestGyro = { x: 0, y: 0, z: 0 };

    try {
      Accelerometer.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
      Gyroscope.setUpdateInterval(SENSOR_UPDATE_INTERVAL_MS);
      gyroSub = Gyroscope.addListener((data) => {
        latestGyro = data;
      });
      accelSub = Accelerometer.addListener((data) => {
        pushSensorSample({
          ax: data.x,
          ay: data.y,
          az: data.z,
          gx: latestGyro.x,
          gy: latestGyro.y,
          gz: latestGyro.z,
        });
      });
    } catch {
      // isAvailableAsync() can false-positive (seen on desktop web); bail
      // out rather than crash or sit through a countdown collecting nothing.
      void endSession();
    }

    return () => {
      accelSub?.remove();
      gyroSub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === 'idle') {
    const disabled = sensorsStatus !== 'available';
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Phone Stability Test</Text>
          <Text style={styles.subtitle}>
            Hold the phone as still as possible for {HOLD_DURATION_MS / 1000}{' '}
            seconds.
          </Text>
          {sensorsStatus === 'unavailable' && (
            <Text style={styles.warning}>
              This test needs a device with both an accelerometer and a
              gyroscope. Please try again on a phone or tablet.
            </Text>
          )}
        </View>
        <Pressable
          style={[styles.startButton, disabled && styles.startButtonDisabled]}
          onPress={start}
          disabled={disabled}
        >
          <Text style={styles.startButtonText}>
            {sensorsStatus === 'checking' ? 'Checking sensors...' : 'Start'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'running') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.timer}>{secondsLeft}s</Text>
          <Text style={styles.subtitle}>Hold still...</Text>
        </View>
      </View>
    );
  }

  if (state === 'submitting') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.subtitle}>Submitting...</Text>
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Submission failed</Text>
          <Text style={styles.subtitle}>Check your connection and try again.</Text>
        </View>
        <Pressable style={styles.startButton} onPress={start}>
          <Text style={styles.startButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Session complete</Text>
        <Text style={styles.subtitle}>Sensor data captured.</Text>
      </View>
      <Pressable style={styles.startButton} onPress={start}>
        <Text style={styles.startButtonText}>Run again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  warning: {
    fontSize: 14,
    color: '#b91c1c',
    textAlign: 'center',
  },
  timer: {
    fontSize: 48,
    fontWeight: '700',
  },
  startButton: {
    backgroundColor: '#111',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  startButtonDisabled: {
    backgroundColor: '#999',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
