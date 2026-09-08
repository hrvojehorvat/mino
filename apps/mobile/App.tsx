import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { TestType } from '@mino/shared-types';
import TappingScreen from './src/TappingScreen';
import ReactionTimeScreen from './src/ReactionTimeScreen';
import TargetTappingScreen from './src/TargetTappingScreen';
import FingerTracingScreen from './src/FingerTracingScreen';
import PhoneStabilityScreen from './src/PhoneStabilityScreen';
import GuidedMovementScreen from './src/GuidedMovementScreen';
import BatchPickerScreen from './src/BatchPickerScreen';
import BatchHistoryScreen from './src/BatchHistoryScreen';
import BatchDetailScreen from './src/BatchDetailScreen';
import SignInScreen from './src/SignInScreen';
import { getToken } from './src/auth';
import { ErrorBoundary } from './src/ErrorBoundary';

const TEST_LABELS: Record<TestType, string> = {
  fingerTapping: 'Finger Tapping',
  reactionTime: 'Reaction Time',
  targetTapping: 'Target Tapping',
  fingerTracing: 'Finger Tracing',
  phoneStability: 'Phone Stability',
  guidedMovement: 'Guided Movement',
};

type Mode =
  | { screen: 'picker' }
  | { screen: 'history' }
  | { screen: 'batchDetail'; batchId: string }
  | { screen: 'running'; batchId: string; tests: TestType[]; index: number }
  | { screen: 'batchComplete'; count: number };

export default function App() {
  const [mode, setMode] = useState<Mode>({ screen: 'picker' });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    getToken().then((token) => setSignedIn(token !== null));
  }, []);

  if (signedIn === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!signedIn) {
    return (
      <>
        <SignInScreen onSignedIn={() => setSignedIn(true)} />
        <StatusBar style="auto" />
      </>
    );
  }

  if (mode.screen === 'picker') {
    return (
      <>
        <BatchPickerScreen
          onStart={(batchId, tests) =>
            setMode({ screen: 'running', batchId, tests, index: 0 })
          }
          onViewHistory={() => setMode({ screen: 'history' })}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  if (mode.screen === 'history') {
    return (
      <>
        <BatchHistoryScreen
          onBack={() => setMode({ screen: 'picker' })}
          onOpenBatch={(batchId) => setMode({ screen: 'batchDetail', batchId })}
          onLoggedOut={() => {
            setSignedIn(false);
            setMode({ screen: 'picker' });
          }}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  if (mode.screen === 'batchDetail') {
    return (
      <>
        <BatchDetailScreen
          batchId={mode.batchId}
          onBack={() => setMode({ screen: 'history' })}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  if (mode.screen === 'batchComplete') {
    return (
      <>
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>Batch complete</Text>
            <Text style={styles.subtitle}>
              {mode.count} test{mode.count === 1 ? '' : 's'} recorded.
            </Text>
          </View>
          <Pressable
            style={styles.startButton}
            onPress={() => setMode({ screen: 'picker' })}
          >
            <Text style={styles.startButtonText}>Done</Text>
          </Pressable>
        </View>
        <StatusBar style="auto" />
      </>
    );
  }

  const currentMode = mode;
  const currentTest = currentMode.tests[currentMode.index];
  const isLast = currentMode.index === currentMode.tests.length - 1;

  const goNext = () => {
    if (isLast) {
      setMode({ screen: 'batchComplete', count: currentMode.tests.length });
    } else {
      setMode({ ...currentMode, index: currentMode.index + 1 });
    }
  };

  const commonProps = {
    batchId: currentMode.batchId,
    onDone: goNext,
    nextLabel: isLast ? 'Finish' : 'Next test',
  };

  return (
    <>
      <View style={styles.screen}>
        <Pressable
          style={styles.backButton}
          onPress={() => setMode({ screen: 'picker' })}
        >
          <Text style={styles.backButtonText}>{'< Cancel'}</Text>
        </Pressable>
        <Text style={styles.progress}>
          {currentMode.index + 1} / {currentMode.tests.length}
        </Text>
        <ErrorBoundary key={`${currentTest}-${currentMode.index}`}>
          {currentTest === 'fingerTapping' && <TappingScreen {...commonProps} />}
          {currentTest === 'reactionTime' && <ReactionTimeScreen {...commonProps} />}
          {currentTest === 'targetTapping' && <TargetTappingScreen {...commonProps} />}
          {currentTest === 'fingerTracing' && <FingerTracingScreen {...commonProps} />}
          {currentTest === 'phoneStability' && <PhoneStabilityScreen {...commonProps} />}
          {currentTest === 'guidedMovement' && <GuidedMovementScreen {...commonProps} />}
        </ErrorBoundary>
      </View>
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  backButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    zIndex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  progress: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 1,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
});
