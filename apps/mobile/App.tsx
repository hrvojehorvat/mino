import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { TestType } from '@mino/shared-types';
import TappingScreen from './src/TappingScreen';
import ReactionTimeScreen from './src/ReactionTimeScreen';
import TargetTappingScreen from './src/TargetTappingScreen';
import FingerTracingScreen from './src/FingerTracingScreen';
import PhoneStabilityScreen from './src/PhoneStabilityScreen';
import GuidedMovementScreen from './src/GuidedMovementScreen';
import { ErrorBoundary } from './src/ErrorBoundary';

const TESTS: { testType: TestType; label: string }[] = [
  { testType: 'fingerTapping', label: 'Finger Tapping' },
  { testType: 'reactionTime', label: 'Reaction Time' },
  { testType: 'targetTapping', label: 'Target Tapping' },
  { testType: 'fingerTracing', label: 'Finger Tracing' },
  { testType: 'phoneStability', label: 'Phone Stability' },
  { testType: 'guidedMovement', label: 'Guided Movement' },
];

export default function App() {
  const [selectedTest, setSelectedTest] = useState<TestType | null>(null);

  return (
    <>
      {selectedTest === null ? (
        <HomeScreen onSelect={setSelectedTest} />
      ) : (
        <View style={styles.screen}>
          <Pressable
            style={styles.backButton}
            onPress={() => setSelectedTest(null)}
          >
            <Text style={styles.backButtonText}>{'< Tests'}</Text>
          </Pressable>
          <ErrorBoundary key={selectedTest}>
            {selectedTest === 'fingerTapping' && <TappingScreen />}
            {selectedTest === 'reactionTime' && <ReactionTimeScreen />}
            {selectedTest === 'targetTapping' && <TargetTappingScreen />}
            {selectedTest === 'fingerTracing' && <FingerTracingScreen />}
            {selectedTest === 'phoneStability' && <PhoneStabilityScreen />}
            {selectedTest === 'guidedMovement' && <GuidedMovementScreen />}
          </ErrorBoundary>
        </View>
      )}
      <StatusBar style="auto" />
    </>
  );
}

function HomeScreen({ onSelect }: { onSelect: (testType: TestType) => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mino</Text>
      <View style={styles.list}>
        {TESTS.map((test) => (
          <Pressable
            key={test.testType}
            style={styles.testButton}
            onPress={() => onSelect(test.testType)}
          >
            <Text style={styles.testButtonText}>{test.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
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
    justifyContent: 'center',
    padding: 24,
    gap: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  list: {
    width: '100%',
    gap: 12,
  },
  testButton: {
    backgroundColor: '#111',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonText: {
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
});
