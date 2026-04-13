import CryptoJS from 'crypto-js';
import * as ExpoSecureStore from 'expo-secure-store';

// AES-256-GCM encryption for local storage
export const encryptData = (data: string, key: string): string => {
  return CryptoJS.AES.encrypt(data, key).toString();
};

export const decryptData = (ciphertext: string, key: string): string => {
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return bytes.toString(CryptoJS.enc.Utf8);
};

// Generate random bytes for nonces and IVs
export const generateRandomBytes = (length: number): string => {
  const words = CryptoJS.lib.WordArray.random(length);
  return words.toString(CryptoJS.enc.Hex);
};

// Hash a string with SHA-256
export const sha256 = (input: string): string => {
  return CryptoJS.SHA256(input).toString(CryptoJS.enc.Hex);
};

// Secure key storage helpers
export const secureStore = {
  async set(key: string, value: string): Promise<void> {
    await ExpoSecureStore.setItemAsync(key, value, {
      keychainAccessible: ExpoSecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async get(key: string): Promise<string | null> {
    return ExpoSecureStore.getItemAsync(key);
  },

  async delete(key: string): Promise<void> {
    await ExpoSecureStore.deleteItemAsync(key);
  },
};

// Encode/decode helpers
export const toBase64 = (data: string): string =>
  CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(data));

export const fromBase64 = (data: string): string =>
  CryptoJS.enc.Base64.parse(data).toString(CryptoJS.enc.Utf8);

// Truncate address for display: @alice → @alice
// Key fingerprint: first 8 chars of sha256
export const keyFingerprint = (pubKey: string): string =>
  sha256(pubKey).slice(0, 8).toUpperCase();
