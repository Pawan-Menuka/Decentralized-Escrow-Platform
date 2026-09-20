import { env } from '../config/env';

interface ChallengeResponse { token?: string; message?: string; expiresAt?: number; error?: string }
interface UploadResponse { cid?: string; contentCid?: string; error?: string }
export interface UploadContext {
  wallet: string;
  jobId: number;
  milestoneIndex: number;
  signMessage: (message: string) => Promise<string>;
}

async function fileDigest(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// The browser signs a short-lived challenge; Pinata credentials remain server-only.
export async function uploadToIpfs(file: File, context: UploadContext): Promise<string> {
  const digest = await fileDigest(file);
  const query = new URLSearchParams({
    wallet: context.wallet,
    digest,
    jobId: String(context.jobId),
    milestoneIndex: String(context.milestoneIndex),
  });
  const challengeResponse = await fetch(`/api/ipfs/challenge?${query.toString()}`, { cache: 'no-store' });
  const challenge = await challengeResponse.json().catch(() => ({})) as ChallengeResponse;
  if (!challengeResponse.ok || !challenge.token || !challenge.message) {
    throw new Error(challenge.error || `Upload authorization failed (${challengeResponse.status}).`);
  }
  const signature = await context.signMessage(challenge.message);
  const form = new FormData();
  form.append('file', file);
  form.append('wallet', context.wallet);
  form.append('digest', digest);
  form.append('jobId', String(context.jobId));
  form.append('milestoneIndex', String(context.milestoneIndex));
  form.append('token', challenge.token);
  form.append('signature', signature);
  const res = await fetch('/api/ipfs', {
    method: 'POST',
    body: form,
  });
  const payload = await res.json().catch(() => ({})) as UploadResponse;
  if (!res.ok || !payload.cid) throw new Error(payload.error || `IPFS upload failed (${res.status}).`);
  return payload.cid;
}

const gatewayUrl = (gateway: string | undefined, cid: string): string =>
  new URL(`ipfs/${encodeURIComponent(cid)}`, gateway).toString();

export const ipfsUrls = (cid: string): [string, string] => [
  gatewayUrl(env.ipfsGatewayUrl, cid),
  gatewayUrl(env.ipfsFallbackGatewayUrl, cid),
];

export const ipfsUrl = (cid: string): string => ipfsUrls(cid)[0];
