import { useMemo, useRef } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTestSession } from './useTestSession';
import type { TestScreenProps } from './TestScreenProps';

const SAMPLE_INTERVAL_MS = 40;
const LINE_THICKNESS = 4;

function buildReferencePath(width: number, height: number) {
  return [
    { x: width * 0.15, y: height * 0.4 },
    { x: width * 0.5, y: height * 0.7 },
    { x: width * 0.85, y: height * 0.4 },
  ];
}

export default function FingerTracingScreen({ batchId, onDone, nextLabel }: TestScreenProps) {
  const { width, height } = useWindowDimensions();
  const referencePath = useMemo(
    () => buildReferencePath(width, height),
    [width, height],
  );

  const { state, eventCount, start, pushEvent, endSession } = useTestSession({
    testType: 'fingerTracing',
    batchId,
    testParams: { referencePath },
  });

  const lastSampleAtRef = useRef(0);

  const onGrant = (e: GestureResponderEvent) => {
    lastSampleAtRef.current = 0;
    pushEvent('touchDown', {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      pointerId: Number(e.nativeEvent.identifier),
    });
  };

  const onMove = (e: GestureResponderEvent) => {
    const now = performance.now();
    if (now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return;
    lastSampleAtRef.current = now;
    pushEvent('touchMove', {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      pointerId: Number(e.nativeEvent.identifier),
    });
  };

  const onRelease = (e: GestureResponderEvent) => {
    pushEvent('touchUp', {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
      pointerId: Number(e.nativeEvent.identifier),
    });
    void endSession();
  };

  if (state === 'idle') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Finger Tracing Test</Text>
          <Text style={styles.subtitle}>
            Trace the line on screen with your finger, start to end.
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
      <View
        style={styles.playArea}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
      >
        <Text style={styles.hint}>Trace the line, then lift your finger</Text>
        {referencePath.slice(1).map((point, i) => {
          const prev = referencePath[i];
          const dx = point.x - prev.x;
          const dy = point.y - prev.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          const midX = (prev.x + point.x) / 2;
          const midY = (prev.y + point.y) / 2;
          return (
            <View
              key={i}
              style={[
                styles.pathSegment,
                {
                  width: length,
                  left: midX - length / 2,
                  top: midY - LINE_THICKNESS / 2,
                  transform: [{ rotate: `${angle}deg` }],
                },
              ]}
            />
          );
        })}
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
  playArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  hint: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 16,
    color: '#444',
  },
  pathSegment: {
    position: 'absolute',
    height: LINE_THICKNESS,
    borderRadius: LINE_THICKNESS / 2,
    backgroundColor: '#3b82f6',
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
