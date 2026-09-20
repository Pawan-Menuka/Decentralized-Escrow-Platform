import { createHash } from 'node:crypto';
import { getAddress } from 'ethers';
import { UploadError } from './errors';
import { RequestLimiter, requestLimiter } from './limits';
import { verifyAuthorization, type UploadAuthorization } from './challenge';

export const MAX_FILE_BYTES = 4_000_000;
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

const PINATA_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const DEFAULT_TIMEOUT_MS = 15_000;
const DAILY_UPLOAD_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1_000;

export interface UploadInput extends UploadAuthorization { file: File }
export interface UploadResult { cid: string; contentCid: string }

interface UploadOptions {
  pinataJwt: string;
  challengeSecret: string;
  fetchImpl?: typeof fetch;
  limiter?: RequestLimiter;
  now?: number;
  timeoutMs?: number;
}

function safeFilename(name: string): string {
  const leaf = name.replace(/\\/g, '/').split('/').pop() ?? 'upload';
  const cleaned = leaf.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim();
  return (cleaned || 'upload').slice(0, 160);
}

function contentMatchesMime(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'text/plain') {
    if (bytes.includes(0)) return false;
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; }
    catch { return false; }
  }
  return false;
}

function pinataCid(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('IpfsHash' in payload) || typeof payload.IpfsHash !== 'string') {
    throw new UploadError(502, 'PINNING_FAILED', 'The storage provider returned an invalid response.');
  }
  return payload.IpfsHash;
}

async function pin(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new UploadError(502, 'PINNING_FAILED', 'The storage provider rejected the upload.');
    return pinataCid(await response.json());
  } catch (error) {
    if (error instanceof UploadError) throw error;
    if (controller.signal.aborted) throw new UploadError(504, 'PINNING_TIMEOUT', 'The storage provider took too long to respond.');
    throw new UploadError(502, 'PINNING_FAILED', 'The storage provider could not accept the upload.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function processUpload(input: UploadInput, options: UploadOptions): Promise<UploadResult> {
  const now = options.now ?? Date.now();
  const authorization = verifyAuthorization(input, options.challengeSecret, now);
  const file = input.file;
  if (!(file instanceof File)) throw new UploadError(400, 'FILE_REQUIRED', 'Choose a file to upload.');
  if (file.size < 1) throw new UploadError(400, 'EMPTY_FILE', 'The selected file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new UploadError(413, 'FILE_TOO_LARGE', 'Files must be smaller than 4 MB.');
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new UploadError(415, 'INVALID_FILE_TYPE', 'Only PDF, plain text, PNG, JPEG, and WebP files are supported.');

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!contentMatchesMime(bytes, file.type)) throw new UploadError(415, 'INVALID_FILE_CONTENT', 'The file content does not match its declared type.');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== authorization.digest) throw new UploadError(401, 'DIGEST_MISMATCH', 'The selected file does not match the signed upload.');

  (options.limiter ?? requestLimiter).check(`wallet:${authorization.wallet}`, DAILY_UPLOAD_LIMIT, DAY_MS, now);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = { Authorization: `Bearer ${options.pinataJwt}` };
  const filename = safeFilename(file.name);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: file.type }), filename);
  form.append('pinataMetadata', JSON.stringify({ name: filename }));
  const contentCid = await pin(fetchImpl, PINATA_FILE_URL, { method: 'POST', headers, body: form }, timeoutMs);

  const manifest = {
    version: 1,
    contentCid,
    originalFilename: file.name.slice(0, 255),
    filename,
    mimeType: file.type,
    size: file.size,
    submittingWallet: getAddress(authorization.wallet),
    jobId: authorization.jobId,
    milestoneIndex: authorization.milestoneIndex,
    timestamp: new Date(now).toISOString(),
  };
  const cid = await pin(fetchImpl, PINATA_JSON_URL, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinataContent: manifest, pinataMetadata: { name: `holdfast-job-${authorization.jobId}-milestone-${authorization.milestoneIndex}.json` } }),
  }, timeoutMs);
  return { cid, contentCid };
}
