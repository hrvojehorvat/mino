import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { login, signup } from './auth';

interface Props {
  onSignedIn: () => void;
}

/** Toggles between sign-up (name + email + password) and log-in (email + password). */
export default function SignInScreen({ onSignedIn }: Props) {
  const [mode, setMode] = useState<'signup' | 'login'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isSignup || name.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isSignup) {
        await signup({ name: name.trim(), email: email.trim(), password });
      } else {
        await login({ email: email.trim(), password });
      }
      onSignedIn();
    } catch {
      setError(
        isSignup
          ? 'Could not sign up. That email may already be registered.'
          : 'Could not log in. Check your email and password.',
      );
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mino</Text>
      <Text style={styles.subtitle}>
        {isSignup ? 'Create an account' : 'Log in'}
      </Text>

      {isSignup && (
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit || submitting}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? 'Please wait...' : isSignup ? 'Sign up' : 'Log in'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.toggle}
        onPress={() => {
          setMode(isSignup ? 'login' : 'signup');
          setError(null);
        }}
      >
        <Text style={styles.toggleText}>
          {isSignup
            ? 'Already have an account? Log in'
            : "Don't have an account? Sign up"}
        </Text>
      </Pressable>
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          Mino is an experimental wellness app, not a medical device — it does
          not diagnose or replace professional medical advice.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    color: '#444',
    marginBottom: 8,
  },
  input: {
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
  submitButton: {
    width: '100%',
    backgroundColor: '#111',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  submitButtonDisabled: {
    backgroundColor: '#999',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    paddingVertical: 8,
  },
  toggleText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  disclaimer: {
    marginTop: 24,
    paddingHorizontal: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
});
