import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadToIpfs } from './ipfs';

describe('authenticated IPFS upload client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('signs the challenge and sends upload context without provider credentials', async () => {
    vi.stubGlobal('crypto', {
      subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0xab).buffer) },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'challenge-token', message: 'sign me' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cid: 'bafy-manifest' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const signMessage = vi.fn().mockResolvedValue('wallet-signature');
    const file = new File(['work'], 'work.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('work').buffer });

    const cid = await uploadToIpfs(file, { wallet: '0xabc', jobId: 4, milestoneIndex: 1, signMessage });

    expect(cid).toBe('bafy-manifest');
    expect(signMessage).toHaveBeenCalledWith('sign me');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/ipfs/challenge?');
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    const form = request.body as FormData;
    expect(form.get('wallet')).toBe('0xabc');
    expect(form.get('jobId')).toBe('4');
    expect(form.get('milestoneIndex')).toBe('1');
    expect(form.get('token')).toBe('challenge-token');
    expect(form.get('signature')).toBe('wallet-signature');
    expect(request.headers).toBeUndefined();
  });

  it('does not ask for a signature when authorization is rejected', async () => {
    vi.stubGlobal('crypto', {
      subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429 })));
    const signMessage = vi.fn();
    const file = new File(['work'], 'work.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1]).buffer });

    await expect(uploadToIpfs(file, { wallet: '0xabc', jobId: 4, milestoneIndex: 1, signMessage })).rejects.toThrow('Too many requests.');
    expect(signMessage).not.toHaveBeenCalled();
  });
});
