import { Platform } from 'react-native';

const IPFS_CONFIG = {
  gateway: 'https://ipfs.io/ipfs/',
  uploadEndpoint: 'https://api.web3.storage/upload',
  pinataEndpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
  cloudflareGateway: 'https://cloudflare-ipfs.com/ipfs/',
};

export interface IPFSUploadResult {
  hash: string;
  url: string;
  size: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// IPFS Service — Media storage via IPFS
// ─────────────────────────────────────────────────────────────────────────────
class IPFSService {
  private apiKey: string = '';

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  // ── Upload file to IPFS ────────────────────────────────────────────────────
  async uploadFile(uri: string, mimeType: string): Promise<IPFSUploadResult> {
    const filename = uri.split('/').pop() ?? 'file';

    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
      type: mimeType,
      name: filename,
    } as any);

    const response = await fetch(IPFS_CONFIG.uploadEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`IPFS upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    const hash = data.cid ?? data.IpfsHash;

    return {
      hash,
      url: this.getUrl(hash),
      size: data.PinSize ?? 0,
    };
  }

  // ── Upload JSON data (for user profile metadata) ──────────────────────────
  async uploadJSON(data: Record<string, any>): Promise<string> {
    const response = await fetch(IPFS_CONFIG.uploadEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error('IPFS JSON upload failed');

    const result = await response.json();
    return result.cid ?? result.IpfsHash;
  }

  // ── Get public gateway URL ─────────────────────────────────────────────────
  getUrl(hash: string): string {
    return `${IPFS_CONFIG.gateway}${hash}`;
  }

  // ── Get URL with fallback gateways ─────────────────────────────────────────
  getUrlWithFallback(hash: string): string[] {
    return [
      `${IPFS_CONFIG.gateway}${hash}`,
      `${IPFS_CONFIG.cloudflareGateway}${hash}`,
      `https://ipfs.fleek.co/ipfs/${hash}`,
    ];
  }

  // ── Fetch JSON from IPFS ───────────────────────────────────────────────────
  async fetchJSON<T>(hash: string): Promise<T> {
    const response = await fetch(this.getUrl(hash));
    if (!response.ok) throw new Error(`Failed to fetch from IPFS: ${hash}`);
    return response.json();
  }
}

export const ipfsService = new IPFSService();
