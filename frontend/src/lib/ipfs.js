// IPFS pinning via Pinata. Set VITE_PINATA_JWT in .env.local.
// Returns the CID string that goes on-chain.
export async function uploadToIpfs(file) {
  const jwt = import.meta.env.VITE_PINATA_JWT;
  if (!jwt) throw new Error('VITE_PINATA_JWT is not set');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status}`);
  const { IpfsHash } = await res.json();
  return IpfsHash;
}

export const ipfsUrl = (cid) => `https://gateway.pinata.cloud/ipfs/${cid}`;
