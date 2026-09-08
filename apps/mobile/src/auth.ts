import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthResponse, LoginRequest, SignupRequest } from '@mino/shared-types';
import { API_BASE_URL } from './config';

const TOKEN_STORAGE_KEY = 'mino.authToken';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_STORAGE_KEY);
}

// Every authenticated fetch call needs this header — throws if somehow
// called while logged out, since callers only reach protected screens after
// a token exists (see App.tsx's login gate).
export async function authHeader(): Promise<{ Authorization: string }> {
  const token = await getToken();
  if (!token) {
    throw new Error('not logged in');
  }
  return { Authorization: `Bearer ${token}` };
}

export async function logout(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function signup(request: SignupRequest): Promise<AuthResponse> {
  return authRequest('/auth/signup', request);
}

export async function login(request: LoginRequest): Promise<AuthResponse> {
  return authRequest('/auth/login', request);
}

async function authRequest(
  path: string,
  body: SignupRequest | LoginRequest,
): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed with status ${response.status}`);
  }

  const result: AuthResponse = await response.json();
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, result.token);
  return result;
}
