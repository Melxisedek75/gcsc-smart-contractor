import { useCallback } from 'react';
import { encryptionService, SignalKeyBundle } from '../services/encryptionService';

export const useEncryption = () => {
  const encrypt = useCallback(
    async (
      recipientId: string,
      recipientBundle: SignalKeyBundle,
      plaintext: string
    ): Promise<string> => {
      return encryptionService.encrypt(recipientId, recipientBundle, plaintext);
    },
    []
  );

  const decrypt = useCallback(
    async (
      senderId: string,
      ciphertext: string,
      isPreKeyMessage: boolean
    ): Promise<string> => {
      return encryptionService.decrypt(senderId, ciphertext, isPreKeyMessage);
    },
    []
  );

  const getSafetyNumber = useCallback(
    async (recipientPublicKey: string): Promise<string> => {
      return encryptionService.getSafetyNumber(recipientPublicKey);
    },
    []
  );

  const getIdentityPublicKey = useCallback(() => {
    return encryptionService.getIdentityPublicKey();
  }, []);

  return { encrypt, decrypt, getSafetyNumber, getIdentityPublicKey };
};
