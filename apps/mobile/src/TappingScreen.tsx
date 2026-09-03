import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SESSION_DURATION_MS } from './config';
import { useTestSession } from './useTestSession';
import type { TestScreenProps } from './TestScreenProps';

export default function TappingScreen({ batchId, onDone, nextLabel }: TestScreenProps) {
  const { state, secondsLeft, eventCount, start, pushEvent } = useTestSession({
    testType: 'fingerTapping',
    batchId,
    durationMs: SESSION_DURATION_MS,
  });

  const recordTouch = (eventType: 'touchDown' | 'touchUp') => (
    e: GestureResponderEvent,
  ) => {
    pushEvent(eventType, {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      pointerId: Number(e.nativeEvent.identifier),
    });
  };

  if (state === 'idle') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Finger Tapping Test</Text>
          <Text style={styles.subtitle}>
            Tap the circle as fast as you can for {SESSION_DURATION_MS / 1000}{' '}
            seconds.
          </Text>
        </View>
        <Pressable style={styles.startButton} onPress={start}>
          <Text style={styles.startButtonText}>Start</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'running') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.timer}>{secondsLeft}s</Text>
          <Text style={styles.subtitle}>Taps: {eventCount}</Text>
          <Pressable
            style={styles.target}
            onPressIn={recordTouch('touchDown')}
            onPressOut={recordTouch('touchUp')}
          />
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
        <Text style={styles.subtitle}>{eventCount} events captured</Text>
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
