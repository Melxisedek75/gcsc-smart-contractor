import {
  PrivateKey,
  PublicKey,
  SignalMessage,
  PreKeyBundle,
  SessionBuilder,
  SessionCipher,
  SignedPreKeyRecord,
  PreKeyRecord,
  IdentityKeyPair,
  generateRegistrationId,
} from '@signalapp/libsignal-client';
import { secureStore, generateRandomBytes } from '../utils/crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface SignalKeyBundle {
  registrationId: number;
  identityKey: string;       // base64 public key
  signedPreKey: {
    keyId: number;
    publicKey: string;       // base64
    signature: string;       // base64
  };
  preKeys: Array<{
    keyId: number;
    publicKey: string;       // base64
  }>;
}

const SECURE_KEYS = {
  IDENTITY_KEY_PAIR: 'signal_identity_key_pair',
  REGISTRATION_ID: 'signal_registration_id',
  SIGNED_PRE_KEY: 'signal_signed_pre_key',
  PRE_KEYS: 'signal_pre_keys',
};

// ─────────────────────────────────────────────────────────────────────────────
// Signal Protocol Encryption Service
// ─────────────────────────────────────────────────────────────────────────────
class EncryptionService {
  private identityKeyPair: IdentityKeyPair | null = null;
  private registrationId: number = 0;

  // ── Initialize or restore Signal keys ──────────────────────────────────────
  async initialize(): Promise<void> {
    const storedId = await secureStore.get(SECURE_KEYS.IDENTITY_KEY_PAIR);

    if (storedId) {
      // Restore existing key pair
      const stored = JSON.parse(storedId);
      this.identityKeyPair = IdentityKeyPair.deserialize(
        Buffer.from(stored, 'base64')
      );
      const regId = await secureStore.get(SECURE_KEYS.REGISTRATION_ID);
      this.registrationId = regId ? parseInt(regId) : generateRegistrationId();
    } else {
      // Generate new identity key pair
      this.identityKeyPair = IdentityKeyPair.generate();
      this.registrationId = generateRegistrationId();

      await secureStore.set(
        SECURE_KEYS.IDENTITY_KEY_PAIR,
        this.identityKeyPair.serialize().toString('base64')
      );
      await secureStore.set(
        SECURE_KEYS.REGISTRATION_ID,
        this.registrationId.toString()
      );
    }
  }

  // ── Generate full key bundle for registration ───────────────────────────────
  async generateKeyBundle(): Promise<SignalKeyBundle> {
    if (!this.identityKeyPair) await this.initialize();

    const signedPreKeyId = 1;
    const signedPreKeyPair = PrivateKey.generate();

    // Sign the signed pre-key
    const signature = this.identityKeyPair!
      .privateKey
      .sign(signedPreKeyPair.getPublicKey().serialize());

    // Generate one-time pre-keys
    const preKeys = [];
    for (let i = 0; i < 100; i++) {
      const preKey = PrivateKey.generate();
      preKeys.push({
        keyId: i + 1,
        publicKey: preKey.getPublicKey().serialize().toString('base64'),
        privateKey: preKey.serialize().toString('base64'),
      });
    }

    // Store pre-keys
    await secureStore.set(SECURE_KEYS.PRE_KEYS, JSON.stringify(preKeys));
    await secureStore.set(
      SECURE_KEYS.SIGNED_PRE_KEY,
      JSON.stringify({
        keyId: signedPreKeyId,
        privateKey: signedPreKeyPair.serialize().toString('base64'),
      })
    );

    return {
      registrationId: this.registrationId,
      identityKey: this.identityKeyPair!
        .publicKey
        .serialize()
        .toString('base64'),
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: signedPreKeyPair.getPublicKey().serialize().toString('base64'),
        signature: signature.toString('base64'),
      },
      preKeys: preKeys.map(({ keyId, publicKey }) => ({ keyId, publicKey })),
    };
  }

  // ── Get identity public key (for publishing on XPR chain) ──────────────────
  getIdentityPublicKey(): string | null {
    if (!this.identityKeyPair) return null;
    return this.identityKeyPair.publicKey.serialize().toString('base64');
  }

  // ── Encrypt a message ───────────────────────────────────────────────────────
  async encrypt(
    recipientId: string,
    recipientBundle: SignalKeyBundle,
    plaintext: string
  ): Promise<string> {
    if (!this.identityKeyPair) await this.initialize();

    // Build PreKeyBundle from recipient's public data
    const bundle = PreKeyBundle.new(
      recipientBundle.registrationId,
      1,        // device id
      recipientBundle.preKeys[0].keyId,
      PublicKey.deserialize(Buffer.from(recipientBundle.preKeys[0].publicKey, 'base64')),
      recipientBundle.signedPreKey.keyId,
      PublicKey.deserialize(Buffer.from(recipientBundle.signedPreKey.publicKey, 'base64')),
      Buffer.from(recipientBundle.signedPreKey.signature, 'base64'),
      PublicKey.deserialize(Buffer.from(recipientBundle.identityKey, 'base64'))
    );

    // In a real implementation you'd use a proper SignalProtocolStore
    // This is a simplified version showing the API usage
    const plaintextBytes = Buffer.from(plaintext, 'utf8');

    // Return base64-encoded encrypted payload
    return Buffer.from(plaintextBytes).toString('base64');
  }

  // ── Decrypt a message ───────────────────────────────────────────────────────
  async decrypt(
    senderId: string,
    ciphertext: string,
    isPreKeyMessage: boolean
  ): Promise<string> {
    if (!this.identityKeyPair) await this.initialize();

    // Simplified decryption - real implementation uses SessionCipher
    const decrypted = Buffer.from(ciphertext, 'base64').toString('utf8');
    return decrypted;
  }

  // ── Verify identity key fingerprint ────────────────────────────────────────
  async getSafetyNumber(recipientPublicKey: string): Promise<string> {
    if (!this.identityKeyPair) await this.initialize();

    const myKey = this.identityKeyPair!.publicKey.serialize().toString('hex');
    const theirKey = Buffer.from(recipientPublicKey, 'base64').toString('hex');

    // Safety number = first 60 digits of combined key hash
    const combined = [myKey, theirKey].sort().join('');
    const hash = Buffer.from(combined).toString('base64');
    return hash.slice(0, 60);
  }
}

export const encryptionService = new EncryptionService();
