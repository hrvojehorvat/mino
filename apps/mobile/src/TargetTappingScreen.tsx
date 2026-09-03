import { useEffect, useState } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SESSION_DURATION_MS } from './config';
import { useTestSession } from './useTestSession';

const TARGET_SIZE = 80;
const TOP_SAFE_AREA = 120;
const BOTTOM_SAFE_AREA = 100;

function randomTargetPosition(width: number, height: number) {
  const maxX = Math.max(width - TARGET_SIZE, 0);
  const maxY = Math.max(height - TOP_SAFE_AREA - BOTTOM_SAFE_AREA - TARGET_SIZE, 0);
  return {
    x: Math.random() * maxX,
    y: TOP_SAFE_AREA + Math.random() * maxY,
  };
}

export default function TargetTappingScreen() {
  const { width, height } = useWindowDimensions();
  const { state, secondsLeft, eventCount, start, pushEvent } = useTestSession({
    testType: 'targetTapping',
    durationMs: SESSION_DURATION_MS,
  });
  const [targetPos, setTargetPos] = useState(() =>
    randomTargetPosition(width, height),
  );

  const spawnTarget = () => {
    const pos = randomTargetPosition(width, height);
    setTargetPos(pos);
    pushEvent('targetShown', { x: pos.x, y: pos.y });
  };

  useEffect(() => {
    if (state === 'running') spawnTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const onTargetPressIn = (e: GestureResponderEvent) => {
    pushEvent('touchDown', {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      pointerId: Number(e.nativeEvent.identifier),
    });
  };

  const onTargetPressOut = (e: GestureResponderEvent) => {
    pushEvent('touchUp', {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      pointerId: Number(e.nativeEvent.identifier),
    });
    spawnTarget();
  };

  if (state === 'idle') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Target Tapping Test</Text>
          <Text style={styles.subtitle}>
            Tap the target as it moves around the screen for{' '}
            {SESSION_DURATION_MS / 1000} seconds.
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
      <View style={styles.playArea}>
        <View style={styles.header}>
          <Text style={styles.timer}>{secondsLeft}s</Text>
          <Text style={styles.subtitle}>Events: {eventCount}</Text>
        </View>
        <Pressable
          style={[styles.target, { left: targetPos.x, top: targetPos.y }]}
          onPressIn={onTargetPressIn}
          onPressOut={onTargetPressOut}
        />
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
  playArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    paddingTop: 64,
    gap: 8,
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
    position: 'absolute',
    width: TARGET_SIZE,
    height: TARGET_SIZE,
    borderRadius: TARGET_SIZE / 2,
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
