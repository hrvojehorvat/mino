import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTestSession } from './useTestSession';
import { useMotionSensors } from './useMotionSensors';
import type { TestScreenProps } from './TestScreenProps';

// On-screen guidance only — the prompts themselves aren't persisted, just
// the raw sensor stream. Matching prompt to motion is ML's job later.
const PROMPTS = [
  { text: 'Hold the phone level and still' },
  { text: 'Tilt slowly to the left' },
  { text: 'Tilt slowly back to level' },
  { text: 'Tilt slowly to the right' },
  { text: 'Tilt slowly back to level' },
  { text: 'Tilt slowly forward' },
  { text: 'Tilt slowly back to level' },
];
const PROMPT_DURATION_MS = 3000;
const TOTAL_DURATION_MS = PROMPTS.length * PROMPT_DURATION_MS;

export default function GuidedMovementScreen({ batchId, onDone, nextLabel }: TestScreenProps) {
  const { state, secondsLeft, start, pushSensorSample, endSession } =
    useTestSession({
      testType: 'guidedMovement',
      batchId,
      durationMs: TOTAL_DURATION_MS,
    });

  const sensorsStatus = useMotionSensors(
    state === 'running',
    pushSensorSample,
    () => void endSession(),
  );

  const [promptIndex, setPromptIndex] = useState(0);

  useEffect(() => {
    if (state !== 'running') return;

    setPromptIndex(0);
    const timers = PROMPTS.slice(1).map((_, i) =>
      setTimeout(() => setPromptIndex(i + 1), (i + 1) * PROMPT_DURATION_MS),
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [state]);

  if (state === 'idle') {
    const disabled = sensorsStatus !== 'available';
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Guided Movement Test</Text>
          <Text style={styles.subtitle}>
            Follow the on-screen prompts to slowly tilt your phone in
            different directions.
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
          <Text style={styles.prompt}>{PROMPTS[promptIndex].text}</Text>
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
      <Pressable style={styles.startButton} onPress={onDone}>
        <Text style={styles.startButtonText}>{nextLabel}</Text>
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
  prompt: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
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
