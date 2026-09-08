import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { TestBatchSummary } from '@mino/shared-types';
import { authHeader, logout } from './auth';
import { API_BASE_URL } from './config';

interface Props {
  onBack: () => void;
  onOpenBatch: (batchId: string) => void;
  onLoggedOut: () => void;
}

export default function BatchHistoryScreen({
  onBack,
  onOpenBatch,
  onLoggedOut,
}: Props) {
  const [batches, setBatches] = useState<TestBatchSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/batches`, {
          headers: await authHeader(),
        });

        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}`);
        }

        const body = await response.json();
        if (!cancelled) setBatches(body);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>{'< Tests'}</Text>
      </Pressable>

      <Pressable
        style={styles.logoutButton}
        onPress={async () => {
          await logout();
          onLoggedOut();
        }}
      >
        <Text style={styles.logoutButtonText}>Log out</Text>
      </Pressable>

      <Text style={styles.title}>Past batches</Text>

      {error && (
        <Text style={styles.subtitle}>Could not load batches.</Text>
      )}
      {!error && batches === null && (
        <ActivityIndicator style={styles.spinner} />
      )}
      {!error && batches !== null && batches.length === 0 && (
        <Text style={styles.subtitle}>No batches yet.</Text>
      )}
      {!error && batches !== null && batches.length > 0 && (
        <FlatList
          style={styles.list}
          data={batches}
          keyExtractor={(batch) => batch.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onOpenBatch(item.id)}>
              <Text style={styles.rowTitle}>{item.name ?? 'Untitled batch'}</Text>
              <Text style={styles.rowSubtitle}>
                {new Date(item.createdAt).toLocaleString()} ·{' '}
                {item.sessionCount} test{item.sessionCount === 1 ? '' : 's'}
              </Text>
            </Pressable>
          )}
        />
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
  spinner: {
    marginTop: 12,
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
  logoutButton: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutButtonText: {
    fontSize: 16,
    color: '#b91c1c',
    fontWeight: '600',
  },
  list: {
    width: '100%',
  },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 4,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 14,
    color: '#666',
  },
});
