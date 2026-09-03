import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, a render error in a test screen produces a silent blank
 * screen in Expo Go instead of a visible message.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Something crashed</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Text style={styles.stack}>{this.state.error.stack}</Text>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 64,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#b91c1c',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: '#111',
    marginBottom: 12,
  },
  stack: {
    fontSize: 11,
    color: '#666',
  },
});
