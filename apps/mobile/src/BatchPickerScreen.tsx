import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { TestType } from '@mino/shared-types';
import { authHeader } from './auth';
import { API_BASE_URL } from './config';

const TESTS: { testType: TestType; label: string }[] = [
  { testType: 'fingerTapping', label: 'Finger Tapping' },
  { testType: 'reactionTime', label: 'Reaction Time' },
  { testType: 'targetTapping', label: 'Target Tapping' },
  { testType: 'fingerTracing', label: 'Finger Tracing' },
  { testType: 'phoneStability', label: 'Phone Stability' },
  { testType: 'guidedMovement', label: 'Guided Movement' },
];

interface Props {
  onStart: (batchId: string, tests: TestType[]) => void;
  onViewHistory: () => void;
}

/**
 * Every test is run as part of a batch — even a batch of one. Tapping a
 * test adds it to the ordered list (shown as a number badge); tapping again
 * removes it. "Start" creates the batch on the backend, then App.tsx runs
 * the picked tests one after another.
 */
export default function BatchPickerScreen({ onStart, onViewHistory }: Props) {
  const [selected, setSelected] = useState<TestType[]>([]);
  const [name, setName] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(false);

  const toggle = (testType: TestType) => {
    setSelected((prev) =>
      prev.includes(testType)
        ? prev.filter((t) => t !== testType)
        : [...prev, testType],
    );
  };

  const handleStart = async () => {
    if (selected.length === 0 || starting) return;
    setStarting(true);
    setError(false);
    try {
      const response = await fetch(`${API_BASE_URL}/batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeader()),
        },
        body: JSON.stringify(name.trim() ? { name: name.trim() } : {}),
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const body = await response.json();
      onStart(body.id, selected);
    } catch {
      setStarting(false);
      setError(true);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mino</Text>

      <Pressable style={styles.historyLink} onPress={onViewHistory}>
        <Text style={styles.historyLinkText}>Past batches →</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Pick your tests, in order</Text>
      <View style={styles.list}>
        {TESTS.map((test) => {
          const position = selected.indexOf(test.testType);
          const isSelected = position !== -1;
          return (
            <Pressable
              key={test.testType}
              style={[styles.testButton, isSelected && styles.testButtonSelected]}
              onPress={() => toggle(test.testType)}
            >
              <Text style={styles.testButtonText}>
                {isSelected ? `${position + 1}. ${test.label}` : test.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={styles.nameInput}
        placeholder="Name this batch (optional)"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
      />

      {error && (
        <Text style={styles.errorText}>
          Could not start the batch. Check your connection and try again.
        </Text>
      )}

      <Pressable
        style={[
          styles.startButton,
          (selected.length === 0 || starting) && styles.startButtonDisabled,
        ]}
        onPress={handleStart}
        disabled={selected.length === 0 || starting}
      >
        <Text style={styles.startButtonText}>
          {starting
            ? 'Starting...'
            : selected.length > 0
              ? `Start (${selected.length})`
              : 'Start'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    padding: 24,
    paddingTop: 72,
    gap: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  historyLink: {
    paddingVertical: 4,
  },
  historyLinkText: {
    fontSize: 15,
    color: '#3b82f6',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 15,
    color: '#444',
    alignSelf: 'flex-start',
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
  testButtonSelected: {
    backgroundColor: '#3b82f6',
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nameInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  errorText: {
    fontSize: 14,
    color: '#b91c1c',
    textAlign: 'center',
  },
  startButton: {
    width: '100%',
    backgroundColor: '#111',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
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
