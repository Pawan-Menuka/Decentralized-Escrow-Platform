import { env } from '../config/env';

interface UploadResponse { cid?: string; error?: string }

// The browser never receives Pinata credentials. Phase 5 supplies this endpoint.
export async function uploadToIpfs(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/ipfs', {
    method: 'POST',
    body: form,
  });
  const payload = await res.json().catch(() => ({})) as UploadResponse;
  if (!res.ok || !payload.cid) throw new Error(payload.error || `IPFS upload failed (${res.status}).`);
  return payload.cid;
}

export const ipfsUrl = (cid: string): string => new URL(`ipfs/${encodeURIComponent(cid)}`, env.ipfsGatewayUrl).toString();
