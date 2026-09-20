import { expect } from 'chai';
import { createHash } from 'node:crypto';
import { Wallet } from 'ethers';
import { issueChallenge } from '../api/_lib/challenge';
import { UploadError } from '../api/_lib/errors';
import { RequestLimiter } from '../api/_lib/limits';
import { MAX_FILE_BYTES, processUpload, type UploadInput } from '../api/_lib/upload';

const SECRET = 'test-only-upload-secret-with-32-characters';
const NOW = Date.UTC(2026, 8, 19, 0, 0, 0);

async function authorizedInput(file: File, signer = Wallet.createRandom()): Promise<UploadInput> {
  const digest = createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex');
  const request = { wallet: signer.address, digest, jobId: 7, milestoneIndex: 2 };
  const challenge = issueChallenge(request, SECRET, NOW);
  return { ...request, file, token: challenge.token, signature: await signer.signMessage(challenge.message) };
}

function successfulPinata(): { fetchImpl: typeof fetch; manifests: unknown[] } {
  const manifests: unknown[] = [];
  let call = 0;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    call += 1;
    if (call === 2 && typeof init?.body === 'string') manifests.push(JSON.parse(init.body));
    return Response.json({ IpfsHash: call === 1 ? 'bafy-content' : 'bafy-manifest' });
  }) as typeof fetch;
  return { fetchImpl, manifests };
}

async function expectUploadError(promise: Promise<unknown>, status: number, code: string): Promise<void> {
  try {
    await promise;
    expect.fail('Expected upload to fail');
  } catch (error) {
    expect(error).to.be.instanceOf(UploadError);
    expect((error as UploadError).status).to.equal(status);
    expect((error as UploadError).code).to.equal(code);
  }
}

describe('IPFS upload service', function () {
  const options = (fetchImpl: typeof fetch) => ({
    pinataJwt: 'server-only-test-token',
    challengeSecret: SECRET,
    fetchImpl,
    limiter: new RequestLimiter(),
    now: NOW,
  });

  it('pins the file and a contextual manifest', async function () {
    const file = new File(['finished work'], '../unsafe<name>.txt', { type: 'text/plain' });
    const input = await authorizedInput(file);
    const pinata = successfulPinata();
    const result = await processUpload(input, options(pinata.fetchImpl));

    expect(result).to.deep.equal({ cid: 'bafy-manifest', contentCid: 'bafy-content' });
    const body = pinata.manifests[0] as { pinataContent: Record<string, unknown> };
    expect(body.pinataContent).to.include({
      contentCid: 'bafy-content',
      originalFilename: '../unsafe<name>.txt',
      filename: 'unsafe_name_.txt',
      mimeType: 'text/plain',
      size: file.size,
      submittingWallet: input.wallet,
      jobId: 7,
      milestoneIndex: 2,
      timestamp: new Date(NOW).toISOString(),
    });
  });

  it('rejects a signature from a different wallet', async function () {
    const file = new File(['work'], 'work.txt', { type: 'text/plain' });
    const input = await authorizedInput(file);
    const attacker = Wallet.createRandom();
    const challenge = issueChallenge({ wallet: input.wallet, digest: input.digest, jobId: 7, milestoneIndex: 2 }, SECRET, NOW);
    input.signature = await attacker.signMessage(challenge.message);
    input.token = challenge.token;
    await expectUploadError(processUpload(input, options(successfulPinata().fetchImpl)), 401, 'INVALID_SIGNATURE');
  });

  it('rejects an oversized file before contacting Pinata', async function () {
    const file = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'large.pdf', { type: 'application/pdf' });
    const input = await authorizedInput(file);
    await expectUploadError(processUpload(input, options(successfulPinata().fetchImpl)), 413, 'FILE_TOO_LARGE');
  });

  it('rejects a file type outside the allowlist', async function () {
    const file = new File(['<script>'], 'page.html', { type: 'text/html' });
    const input = await authorizedInput(file);
    await expectUploadError(processUpload(input, options(successfulPinata().fetchImpl)), 415, 'INVALID_FILE_TYPE');
  });

  it('rejects content that masquerades as an allowed type', async function () {
    const file = new File(['not really a PDF'], 'work.pdf', { type: 'application/pdf' });
    const input = await authorizedInput(file);
    await expectUploadError(processUpload(input, options(successfulPinata().fetchImpl)), 415, 'INVALID_FILE_CONTENT');
  });

  it('maps a Pinata rejection to a safe service error', async function () {
    const file = new File(['work'], 'work.txt', { type: 'text/plain' });
    const input = await authorizedInput(file);
    const fetchImpl = (async () => new Response('provider detail must not escape', { status: 500 })) as typeof fetch;
    await expectUploadError(processUpload(input, options(fetchImpl)), 502, 'PINNING_FAILED');
  });

  it('aborts and reports a provider timeout', async function () {
    const file = new File(['work'], 'work.txt', { type: 'text/plain' });
    const input = await authorizedInput(file);
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
    await expectUploadError(processUpload(input, { ...options(fetchImpl), timeoutMs: 5 }), 504, 'PINNING_TIMEOUT');
  });
});
