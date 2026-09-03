import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

const STORAGE_KEY = 'mino.deviceId';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const deviceId = randomUUID();
  await AsyncStorage.setItem(STORAGE_KEY, deviceId);
  return deviceId;
}
