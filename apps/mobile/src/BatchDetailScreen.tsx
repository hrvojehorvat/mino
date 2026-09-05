import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TestBatchDetail, TestType } from '@mino/shared-types';
import { API_BASE_URL } from './config';
import { getOrCreateDeviceId } from './deviceId';

const TEST_LABELS: Record<TestType, string> = {
  fingerTapping: 'Finger Tapping',
  reactionTime: 'Reaction Time',
  targetTapping: 'Target Tapping',
  fingerTracing: 'Finger Tracing',
  phoneStability: 'Phone Stability',
  guidedMovement: 'Guided Movement',
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

interface Props {
  batchId: string;
  onBack: () => void;
}

export default function BatchDetailScreen({ batchId, onBack }: Props) {
  const [detail, setDetail] = useState<TestBatchDetail | null>(null);
  const [error, setError] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        const response = await fetch(
          `${API_BASE_URL}/batches/${batchId}?deviceId=${encodeURIComponent(deviceId)}`,
        );

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const body: TestBatchDetail = await response.json();
        if (cancelled) return;

        setDetail(body);
        attemptsRef.current += 1;

        const stillProcessing = body.sessions.some((s) => s.mlResult === null);
        if (stillProcessing) {
          if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
            setGaveUp(true);
          } else {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [batchId]);

  const stillProcessing =
    detail !== null && detail.sessions.some((s) => s.mlResult === null);
  const allComputed =
    detail !== null && detail.sessions.every((s) => s.mlResult !== null);

  const requestExplanation = async () => {
    if (detail === null) return;
    setExplaining(true);
    setExplainError(false);

    try {
      const deviceId = await getOrCreateDeviceId();
      const response = await fetch(
        `${API_BASE_URL}/batches/${batchId}/explain`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const llmExplanation = await response.json();
      setDetail((prev) => (prev ? { ...prev, llmExplanation } : prev));
    } catch {
      setExplainError(true);
    } finally {
      setExplaining(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>{'< Batches'}</Text>
      </Pressable>

      <Text style={styles.title}>{detail?.name ?? 'Batch'}</Text>

      {error && <Text style={styles.subtitle}>Could not load this batch.</Text>}

      {!error && detail === null && (
        <View style={styles.waitingRow}>
          <ActivityIndicator />
          <Text style={styles.subtitle}>Loading...</Text>
        </View>
      )}

      {!error && detail !== null && (
        <ScrollView style={styles.list}>
          {detail.sessions.map((session) => (
            <View key={session.id} style={styles.card}>
              <Text style={styles.cardTitle}>{TEST_LABELS[session.testType]}</Text>
              <Text style={styles.cardSubtitle}>
                {new Date(session.startedAt).toLocaleString()} · {session.status}
              </Text>

              {session.mlResult ? (
                <View style={styles.metrics}>
                  {Object.entries(session.mlResult.metrics).map(([key, value]) => (
                    <Text key={key} style={styles.metricRow}>
                      {key}: {String(value)}
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={styles.processing}>
                  {gaveUp ? 'Still processing — check back later.' : 'Processing...'}
                </Text>
              )}
            </View>
          ))}

          {stillProcessing && !gaveUp && (
            <View style={styles.waitingRow}>
              <ActivityIndicator />
              <Text style={styles.subtitle}>Waiting for results...</Text>
            </View>
          )}

          {allComputed && detail.llmExplanation && (
            <View style={styles.explanationCard}>
              <Text style={styles.explanationTitle}>What this shows</Text>
              <Text style={styles.explanationText}>
                {detail.llmExplanation.text}
              </Text>
            </View>
          )}

          {allComputed && !detail.llmExplanation && !explaining && (
            <Pressable
              style={styles.explainButton}
              onPress={requestExplanation}
            >
              <Text style={styles.explainButtonText}>
                Explain these results
              </Text>
            </Pressable>
          )}

          {explaining && (
            <View style={styles.waitingRow}>
              <ActivityIndicator />
              <Text style={styles.subtitle}>Generating explanation...</Text>
            </View>
          )}

          {explainError && (
            <View style={styles.explainErrorRow}>
              <Text style={styles.subtitle}>
                Couldn't generate an explanation. Try again?
              </Text>
              <Pressable onPress={requestExplanation}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 96,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#444',
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
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  list: {
    width: '100%',
  },
  card: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  metrics: {
    marginTop: 6,
    gap: 2,
  },
  metricRow: {
    fontSize: 14,
    color: '#333',
  },
  processing: {
    marginTop: 6,
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
  },
  explanationCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f2f6ff',
    gap: 6,
  },
  explanationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e3a8a',
  },
  explanationText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#333',
  },
  explainButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  explainButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  explainErrorRow: {
    marginTop: 12,
    gap: 6,
  },
  retryText: {
    fontSize: 15,
    color: '#3b82f6',
    fontWeight: '600',
  },
});
