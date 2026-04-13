import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

const GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.fleek.co/ipfs/',
];

export interface IPFSUploadResult {
  hash: string;
  url: string;
  size: number;
}

export interface MediaInfo {
  uri: string;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  size?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// IPFS Service
// ─────────────────────────────────────────────────────────────────────────────
class IPFSService {
  private apiKey = '';
  private uploadUrl = 'https://api.web3.storage/upload';

  setApiKey(key: string): void { this.apiKey = key; }

  // ── Upload any file ────────────────────────────────────────────────────────
  async uploadFile(info: MediaInfo): Promise<IPFSUploadResult> {
    const filename = info.uri.split('/').pop() ?? 'file';
    const formData = new FormData();

    formData.append('file', {
      uri: Platform.OS === 'ios' ? info.uri.replace('file://', '') : info.uri,
      type: info.mimeType,
      name: filename,
    } as any);

    const response = await fetch(this.uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) throw new Error(`IPFS upload failed: ${response.status}`);

    const data = await response.json();
    const hash: string = data.cid ?? data.IpfsHash ?? '';

    return { hash, url: this.getUrl(hash), size: data.PinSize ?? info.size ?? 0 };
  }

  // ── Upload image with compression ─────────────────────────────────────────
  async uploadImage(
    uri: string,
    quality = 0.85,
    maxWidth = 1920
  ): Promise<IPFSUploadResult & { width: number; height: number }> {
    // Resize/compress before upload
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );

    const result = await this.uploadFile({
      uri: manipulated.uri,
      mimeType: 'image/jpeg',
      width: manipulated.width,
      height: manipulated.height,
    });

    return {
      ...result,
      width: manipulated.width,
      height: manipulated.height,
    };
  }

  // ── Upload avatar (square crop) ────────────────────────────────────────────
  async uploadAvatar(uri: string): Promise<IPFSUploadResult> {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 256, height: 256 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );

    return this.uploadFile({ uri: manipulated.uri, mimeType: 'image/jpeg' });
  }

  // ── Upload JSON (metadata) ─────────────────────────────────────────────────
  async uploadJSON(data: Record<string, unknown>): Promise<string> {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const formData = new FormData();
    formData.append('file', blob as any, 'metadata.json');

    const response = await fetch(this.uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) throw new Error('IPFS JSON upload failed');
    const result = await response.json();
    return result.cid ?? result.IpfsHash;
  }

  // ── Fetch JSON ─────────────────────────────────────────────────────────────
  async fetchJSON<T>(hash: string): Promise<T> {
    for (const gateway of GATEWAYS) {
      try {
        const response = await fetch(`${gateway}${hash}`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) return response.json();
      } catch {
        // Try next gateway
      }
    }
    throw new Error(`Cannot fetch IPFS content: ${hash}`);
  }

  // ── URL helpers ────────────────────────────────────────────────────────────
  getUrl(hash: string): string { return `${GATEWAYS[0]}${hash}`; }

  resolveUrl(url: string): string {
    if (url.startsWith('ipfs://')) return `${GATEWAYS[0]}${url.slice(7)}`;
    return url;
  }

  getAllUrls(hash: string): string[] {
    return GATEWAYS.map((g) => `${g}${hash}`);
  }
}

export const ipfsService = new IPFSService();
