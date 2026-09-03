import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTestSession } from './useTestSession';

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 4000;
const TRIAL_COUNT = 5;

export default function ReactionTimeScreen() {
  const { state, start, pushEvent, endSession } = useTestSession({
    testType: 'reactionTime',
  });
  const [stimulusVisible, setStimulusVisible] = useState(false);
  const [trialIndex, setTrialIndex] = useState(0);
  const [reactionTimes, setReactionTimes] = useState<number[]>([]);

  const waitingForTapRef = useRef(false);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stimulusShownAtRef = useRef(0);

  useEffect(() => {
    if (state !== 'running') return;

    waitingForTapRef.current = false;
    setStimulusVisible(false);
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    delayTimerRef.current = setTimeout(() => {
      pushEvent('stimulusShown');
      stimulusShownAtRef.current = performance.now();
      waitingForTapRef.current = true;
      setStimulusVisible(true);
    }, delay);

    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, trialIndex]);

  const handleStart = () => {
    setTrialIndex(0);
    setReactionTimes([]);
    start();
  };

  const onTap = () => {
    if (state !== 'running' || !waitingForTapRef.current) return;
    waitingForTapRef.current = false;
    pushEvent('touchDown');
    const reactionMs = Math.round(performance.now() - stimulusShownAtRef.current);
    setReactionTimes((prev) => [...prev, reactionMs]);
    setStimulusVisible(false);

    if (trialIndex + 1 >= TRIAL_COUNT) {
      void endSession();
    } else {
      setTrialIndex((i) => i + 1);
    }
  };

  if (state === 'idle') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Reaction Time Test</Text>
          <Text style={styles.subtitle}>
            Wait for the screen to turn green, then tap as fast as you can.
            {'\n'}
            {TRIAL_COUNT} trials, back to back.
          </Text>
        </View>
        <Pressable style={styles.startButton} onPress={handleStart}>
          <Text style={styles.startButtonText}>Start</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'running') {
    return (
      <Pressable
        style={[styles.container, stimulusVisible && styles.containerActive]}
        onPress={onTap}
      >
        <View style={styles.content}>
          <Text style={styles.subtitle}>
            Trial {trialIndex + 1} of {TRIAL_COUNT}
          </Text>
          <Text style={styles.subtitle}>
            {stimulusVisible ? 'Tap now!' : 'Wait for it...'}
          </Text>
        </View>
      </Pressable>
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
        <Pressable style={styles.startButton} onPress={handleStart}>
          <Text style={styles.startButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const average = reactionTimes.length
    ? Math.round(
        reactionTimes.reduce((sum, ms) => sum + ms, 0) / reactionTimes.length,
      )
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Session complete</Text>
        <Text style={styles.subtitle}>
          Average reaction time: {average}ms across {reactionTimes.length} trials
        </Text>
      </View>
      <Pressable style={styles.startButton} onPress={handleStart}>
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
  containerActive: {
    backgroundColor: '#22c55e',
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
