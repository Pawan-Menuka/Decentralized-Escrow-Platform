/**
 * Copies the compiled FreelanceEscrow ABI to every consumer that needs it.
 * Run after any contract change: `npm run sync-abi` (compile first).
 */
const fs = require("fs");
const path = require("path");

const artifact = path.join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "FreelanceEscrow.sol",
  "FreelanceEscrow.json",
);
if (!fs.existsSync(artifact)) {
  console.error("No artifact found — run `npx hardhat compile` first.");
  process.exit(1);
}

const { abi } = JSON.parse(fs.readFileSync(artifact, "utf8"));
const targets = [
  path.join(__dirname, "..", "frontend", "src", "config", "FreelanceEscrow.abi.json"),
  path.join(__dirname, "..", "subgraph", "abis", "FreelanceEscrow.json"),
];

for (const t of targets) {
  if (!fs.existsSync(path.dirname(t))) continue;
  fs.writeFileSync(t, JSON.stringify(abi, null, 2) + "\n");
  console.log(`synced → ${path.relative(path.join(__dirname, ".."), t)}`);
}
console.log(`ABI entries: ${abi.length}`);
