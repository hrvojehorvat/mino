import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import type { SensorSample } from '@mino/shared-types';

const SENSOR_UPDATE_INTERVAL_MS = 20; // ~50Hz

export type SensorsStatus = 'checking' | 'available' | 'unavailable';

/**
 * Shared accelerometer+gyroscope capture used by every sensor-based test
 * (phone stability, guided movement). expo-sensors' web shim unreliably
 * reports availability (isAvailableAsync can resolve true even though
 * setUpdateInterval/addListener then fail) — Mino is a mobile app, so web
 * is always treated as unavailable rather than trusting that shim.
 */
export function useMotionSensors(
  isRunning: boolean,
  onSample: (sample: Omit<SensorSample, 'tMs'>) => void,
  onSubscriptionError: () => void,
): SensorsStatus {
  const [status, setStatus] = useState<SensorsStatus>('checking');
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;
  const onSubscriptionErrorRef = useRef(onSubscriptionError);
  onSubscriptionErrorRef.current = onSubscriptionError;

  useEffect(() => {
    if (Platform.OS === 'web') {
      setStatus('unavailable');
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
          setStatus(accelAvailable && gyroAvailable ? 'available' : 'unavailable');
        }
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isRunning) return;

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
        onSampleRef.current({
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
      onSubscriptionErrorRef.current();
    }

    return () => {
      accelSub?.remove();
      gyroSub?.remove();
    };
  }, [isRunning]);

  return status;
}
