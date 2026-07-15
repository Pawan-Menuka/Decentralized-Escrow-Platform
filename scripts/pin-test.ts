/**
 * Manual live-pin smoke test for the Pinata IPFS helper (Phase 11).
 *
 * NOT part of CI — this hits the real Pinata API and needs a free Pinata JWT
 * (https://pinata.cloud) set as PINATA_JWT in .env.
 *
 * Run with:
 *   npx hardhat run scripts/pin-test.ts
 *   npx ts-node scripts/pin-test.ts
 */
import "dotenv/config";
import { pinJson, cidUrl } from "./lib/ipfs";

async function main() {
  if (!process.env.PINATA_JWT) {
    console.error(
      "PINATA_JWT is not set. Add PINATA_JWT=<your Pinata JWT> to .env (get a free one at https://pinata.cloud) and re-run.",
    );
    process.exitCode = 1;
    return;
  }

  const sampleDeliverable = {
    title: "Milestone 1: initial design mockups",
    description: "Wireframes and component library delivered for review.",
    submittedAt: new Date().toISOString(),
    repo: "https://github.com/example/freelance-escrow-demo",
  };

  console.log("Pinning sample deliverable to IPFS via Pinata...");
  const cid = await pinJson(sampleDeliverable, "pin-test-deliverable");

  console.log(`\nPinned! CID: ${cid}`);
  console.log(`Gateway URL: ${cidUrl(cid)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
