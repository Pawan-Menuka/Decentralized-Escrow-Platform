import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAddress, isAddress, verifyMessage } from 'ethers';
import { UploadError } from './errors';

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export interface ChallengeRequest {
  wallet: string;
  digest: string;
  jobId: number;
  milestoneIndex: number;
}

export interface ChallengePayload extends ChallengeRequest {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface UploadAuthorization extends ChallengeRequest {
  token: string;
  signature: string;
}

function validateRequest(input: ChallengeRequest): ChallengeRequest {
  if (!isAddress(input.wallet)) throw new UploadError(400, 'INVALID_WALLET', 'A valid wallet address is required.');
  if (!DIGEST_PATTERN.test(input.digest)) throw new UploadError(400, 'INVALID_DIGEST', 'A valid SHA-256 file digest is required.');
  if (!Number.isSafeInteger(input.jobId) || input.jobId < 1) throw new UploadError(400, 'INVALID_JOB', 'Job IDs start at 1.');
  if (!Number.isSafeInteger(input.milestoneIndex) || input.milestoneIndex < 0) throw new UploadError(400, 'INVALID_MILESTONE', 'A valid milestone index is required.');
  return { ...input, wallet: getAddress(input.wallet), digest: input.digest.toLowerCase() };
}

export function challengeMessage(payload: ChallengePayload): string {
  return [
    'Holdfast IPFS upload authorization',
    `Wallet: ${payload.wallet}`,
    `File SHA-256: ${payload.digest}`,
    `Job: ${payload.jobId}`,
    `Milestone: ${payload.milestoneIndex}`,
    `Nonce: ${payload.nonce}`,
    `Issued at: ${new Date(payload.issuedAt).toISOString()}`,
    `Expires at: ${new Date(payload.expiresAt).toISOString()}`,
    'Chain ID: 11155111',
  ].join('\n');
}

function signature(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

export function issueChallenge(input: ChallengeRequest, secret: string, now = Date.now()): { token: string; message: string; expiresAt: number } {
  if (secret.length < 32) throw new Error('UPLOAD_CHALLENGE_SECRET must contain at least 32 characters.');
  const request = validateRequest(input);
  const payload: ChallengePayload = {
    ...request,
    nonce: randomBytes(16).toString('hex'),
    issuedAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${encoded}.${signature(encoded, secret)}`;
  return { token, message: challengeMessage(payload), expiresAt: payload.expiresAt };
}

export function parseChallenge(token: string, secret: string, now = Date.now()): ChallengePayload {
  const [encoded, provided] = token.split('.');
  if (!encoded || !provided) throw new UploadError(401, 'INVALID_CHALLENGE', 'The upload challenge is invalid.');
  const expected = signature(encoded, secret);
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    throw new UploadError(401, 'INVALID_CHALLENGE', 'The upload challenge is invalid.');
  }
  let payload: ChallengePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ChallengePayload;
  } catch {
    throw new UploadError(401, 'INVALID_CHALLENGE', 'The upload challenge is invalid.');
  }
  const normalized = validateRequest(payload);
  if (!payload.nonce || payload.issuedAt > now + 5_000 || payload.expiresAt < now || payload.expiresAt - payload.issuedAt !== CHALLENGE_TTL_MS) {
    throw new UploadError(401, 'EXPIRED_CHALLENGE', 'The upload authorization has expired. Request a new signature.');
  }
  return { ...payload, ...normalized };
}

export function verifyAuthorization(authorization: UploadAuthorization, secret: string, now = Date.now()): ChallengePayload {
  const payload = parseChallenge(authorization.token, secret, now);
  const request = validateRequest(authorization);
  if (
    payload.wallet !== request.wallet
    || payload.digest !== request.digest
    || payload.jobId !== request.jobId
    || payload.milestoneIndex !== request.milestoneIndex
  ) {
    throw new UploadError(401, 'CHALLENGE_MISMATCH', 'The upload does not match its signed challenge.');
  }
  let signer: string;
  try {
    signer = getAddress(verifyMessage(challengeMessage(payload), authorization.signature));
  } catch {
    throw new UploadError(401, 'INVALID_SIGNATURE', 'The wallet signature is invalid.');
  }
  if (signer !== payload.wallet) throw new UploadError(401, 'INVALID_SIGNATURE', 'The wallet signature does not match the upload wallet.');
  return payload;
}
