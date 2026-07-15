/**
 * Minimal Pinata pinning helper (Node, Phase 11).
 *
 * Uses the platform's global `fetch`/`FormData`/`Blob` (Node 20+) — no extra
 * dependencies. Deliverables/evidence are pinned off-chain via Pinata; only
 * the returned CID is ever stored on-chain (in `deliverableCid`/`evidenceCid`).
 *
 * Requires a Pinata JWT (free tier: https://pinata.cloud) set as `PINATA_JWT`
 * in `.env`, or passed explicitly.
 */

const PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const GATEWAY_URL = "https://gateway.pinata.cloud/ipfs";

function resolveJwt(jwt?: string): string {
  const resolved = jwt ?? process.env.PINATA_JWT;
  if (!resolved) {
    throw new Error(
      "Missing Pinata JWT: set PINATA_JWT in .env (get one free at https://pinata.cloud) or pass it explicitly.",
    );
  }
  return resolved;
}

/**
 * Pins an arbitrary JSON-serializable object to IPFS via Pinata's
 * `pinJSONToIPFS` endpoint.
 *
 * @param content - The object to pin (e.g. a deliverable/evidence payload).
 * @param name - Optional Pinata metadata name for the pin (for the Pinata dashboard).
 * @param jwt - Pinata JWT; defaults to `process.env.PINATA_JWT`.
 * @returns The resulting IPFS CID (`IpfsHash`).
 */
export async function pinJson(content: unknown, name?: string, jwt?: string): Promise<string> {
  const token = resolveJwt(jwt);

  const body: Record<string, unknown> = { pinataContent: content };
  if (name) {
    body.pinataMetadata = { name };
  }

  const res = await fetch(PIN_JSON_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "<no response body>");
    throw new Error(`pinJson failed: ${res.status} ${res.statusText} — ${text}`);
  }

  const json = (await res.json()) as { IpfsHash: string };
  return json.IpfsHash;
}

/**
 * Pins raw file data to IPFS via Pinata's `pinFileToIPFS` endpoint.
 *
 * @param data - File bytes as a `Uint8Array` or `Blob`.
 * @param filename - Filename to attach to the multipart upload.
 * @param jwt - Pinata JWT; defaults to `process.env.PINATA_JWT`.
 * @returns The resulting IPFS CID (`IpfsHash`).
 */
export async function pinFile(data: Uint8Array | Blob, filename: string, jwt?: string): Promise<string> {
  const token = resolveJwt(jwt);

  const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
  const form = new FormData();
  form.append("file", blob, filename);

  const res = await fetch(PIN_FILE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "<no response body>");
    throw new Error(`pinFile failed: ${res.status} ${res.statusText} — ${text}`);
  }

  const json = (await res.json()) as { IpfsHash: string };
  return json.IpfsHash;
}

/**
 * Builds a Pinata gateway URL for a given CID.
 */
export function cidUrl(cid: string): string {
  return `${GATEWAY_URL}/${cid}`;
}
