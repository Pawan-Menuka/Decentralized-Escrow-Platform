# Decentralized Freelance Escrow Platform

[![CI](https://github.com/Pawan-Menuka/Decentralized-Escrow-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/Pawan-Menuka/Decentralized-Escrow-Platform/actions/workflows/ci.yml)

**Live on Sepolia** — verified contract: [`0x85DBE339432cd7960FADFef78e2E6981025bD4BA`](https://sepolia.etherscan.io/address/0x85DBE339432cd7960FADFef78e2E6981025bD4BA#code), supported USDC: [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238), ETH/USD price feed: Chainlink `0x694AA1769357215DE4FAC081bf1f309aDC325306`.

A milestone-based escrow protocol for freelance work on Ethereum (Sepolia testnet). A client creates and funds a job split into milestones; a freelancer accepts the job and submits work per milestone; the client approves (releasing funds) or disputes; a trusted arbitrator resolves disputes with an arbitrary split; and if the client goes silent after a submission, funds auto-release to the freelancer once a time-lock expires. All fund movement uses the pull-payment pattern, and the protocol skims a small, capped basis-point fee on every release to the freelancer.

This repository is being built in tiers — an immutable, security-first Solidity contract first (Tier 1), then Chainlink oracle/automation integration (Tier 2), then off-chain IPFS storage and a subgraph (Tier 3), then a full wagmi/RainbowKit frontend (Tier 4). See the roadmap below for what's shipped so far.

## State machines

### Job state machine

| From | Event/call | To |
|---|---|---|
| — | `createJob` (payable, fully funded) | `FUNDED` |
| `FUNDED` | `acceptJob` (freelancer) | `IN_PROGRESS` |
| `FUNDED` | `cancelJob` (client) | `CANCELLED` |
| `IN_PROGRESS` | last milestone reaches terminal released/resolved state | `COMPLETED` |
| `IN_PROGRESS` | `raiseDispute` on any milestone | `DISPUTED` |
| `DISPUTED` | `resolveDispute` (no other milestone disputed) | `IN_PROGRESS` (or `COMPLETED` if it was the last) |

### Per-milestone state machine

| From | Event/call | To |
|---|---|---|
| `PENDING` | `submitMilestone` (freelancer) | `SUBMITTED` |
| `SUBMITTED` | `approveMilestone` (client) | `APPROVED` (funds credited) |
| `SUBMITTED` | `rejectMilestone` (client) | `PENDING` (resubmittable) |
| `SUBMITTED` | `raiseDispute` (client or freelancer) | `DISPUTED` |
| `SUBMITTED` | time-lock expiry + `performUpkeep`/`claimTimelockRelease` | `AUTO_RELEASED` (funds credited) |
| `DISPUTED` | `resolveDispute` (arbitrator, any bps split) | `RESOLVED` (both shares credited) |

Terminal milestone states: `APPROVED`, `AUTO_RELEASED`, `RESOLVED`. A job is `COMPLETED` when **all** milestones are terminal.

## Tier roadmap

- **Tier 1 — Core contract:** immutable `FreelanceEscrow.sol` with pull payments, CEI, reentrancy guards, dispute arbitration, and a time-lock auto-release. Verified on Sepolia Etherscan, >90% test coverage, Foundry fuzz invariants, zero high/medium Slither findings, green CI.
- **Tier 2 — Chainlink core:** USD-denominated jobs via Chainlink Price Feeds, autonomous time-lock releases via Chainlink Automation, and ERC-20/USDC support.
- **Tier 3 — Advanced off-chain:** IPFS deliverable/evidence storage via Pinata and a The Graph subgraph for event-driven reads. Chainlink Functions PR auto-approval is deliberately deferred to a future contract version so the deployed launch ABI remains frozen.
- **Tier 4 — Frontend:** a Vite + React + wagmi + RainbowKit dapp (client, freelancer, and arbitrator flows) reading from the subgraph, deployed to Vercel.

Total infrastructure cost target: **$0** (Sepolia faucets and free tiers throughout).

## Testing

`FreelanceEscrow.sol` has **143 passing Hardhat tests** across unit, integration, ERC-20, and attack suites (`test/*.ts`), plus dedicated mocks in `contracts/mocks/` (`MaliciousReceiver`, `RevertingReceiver`, `MockERC20`, `FeeOnTransferERC20`) and a Chainlink `MockV3Aggregator` for price-feed tests.

- `npx hardhat test` — 143 passing (happy paths, full wrong-caller/wrong-state guard matrix, fee accounting to the wei, integration lifecycles, reentrancy + pull-payment-DoS attack tests, USD price-feed conversion incl. staleness/invalid-price handling, Chainlink Automation check/perform upkeep incl. batching + forged-data re-validation, and a full ERC-20/USDC lifecycle).
- `npx hardhat coverage` (`.solcover.js` skips `contracts/mocks`) — **100% lines, 93.06% branches, 100% functions, 98.98% statements** on `FreelanceEscrow.sol`.
- **ERC-20/USDC support (Phase 10):** `createJob` accepts either native ETH (`token == address(0)`) or an ERC-20 token, pulling the total via `SafeERC20.safeTransferFrom` and crediting/withdrawing per-token throughout (`pendingWithdrawals`/`accruedFees` are keyed by token). The launch website supports only ETH and official Sepolia USDC. `createJob` measures the escrow's balance delta and rejects tokens that deliver less than requested, including the tested fee-on-transfer mock; this initial check does **not** make rebasing or malicious tokens safe over a job's lifetime. `test/FreelanceEscrow.erc20.ts` covers the full lifecycle, dispute split, cancellation, fee-on-transfer rejection, and ETH/token coexistence.
- Attack tests prove: (1) a malicious freelancer contract that re-enters `withdraw()` from its own `receive()` gains nothing beyond its credited balance — the whole transaction reverts (`EthTransferFailed`), since `nonReentrant` + the zero-before-transfer (CEI) pattern block the reentrant call; (2) **the pull-payment thesis** — a freelancer contract that unconditionally reverts on receiving ETH can NEVER brick the client's `approveMilestone` (no external call is made there), only its own subsequent `withdraw()` fails, isolating the damage to the bad actor.
- Remaining uncovered branches are documented, not overlooked: two idempotent no-op guards in the internal scan-set helpers (`_addActive`/`_removeActive`) that are unreachable through the public API given the state-machine guards; and a few `nonReentrant` "already entered" branches on functions that make no external call themselves and so can only be reached via genuine cross-function reentrancy (not exercised — the only external-call surfaces, `withdraw`/`withdrawFees`, are the ones the attack tests target).

### Fuzz / invariant tests (Foundry)

A hybrid Foundry suite (`foundry/test/`) runs property-based invariant tests via a bounded stateful handler that drives random full-lifecycle sequences:

- **Conservation** — the escrow's ETH balance always equals `deposited − withdrawn − feesWithdrawn`; no wei is created, destroyed, or stranded.
- **Solvency** — the balance is always ≥ every outstanding withdrawable balance plus accrued fees (the contract can always pay what it owes).
- **Fee cap** — `feeBps` never exceeds `MAX_FEE_BPS`, even though the handler calls `setFeeBps` with unbounded random values.

These run in CI on every push (`forge test`).

## Frontend — Holdfast

`frontend/` is **Holdfast**, a hand-designed Vite + React + wagmi/viem + RainbowKit dapp wired to the live Sepolia contract. Dark ledger aesthetic, IBM Plex, and a milestone **state rail** that draws the actual state machine per milestone.

- **Role-aware by address.** The same job page derives your role — client, freelancer, arbitrator, or observer — from the connected wallet against the job's parties, and shows only the actions that are valid for your role *and* the current state. Browsing works with no wallet at all.
- **Per-job arbitration.** The client names a neutral arbitrator at creation; the arbitrator desk lists jobs where you're the named arbitrator, and disputes are settled with a split slider that previews both payouts and the fee before you sign.
- **The whole tx lifecycle is visible** ("Confirm in your wallet… → Sending → Done ✓"), and every milestone shows a live countdown to its automatic payout.
- **ETH and USDC**, including the real two-signature approve → createJob flow; deliverables and dispute evidence upload to **IPFS** and only the CID goes on-chain.

```bash
cd frontend && npm install --legacy-peer-deps
cp .env.example .env.local   # contract addresses pre-filled; add a WalletConnect id
npm run dev
```

> **Security note:** the browser contains no Pinata credential. It hashes the selected file, signs a short-lived wallet challenge, and sends the signed upload to `/api/ipfs`. The server validates the exact file and context before pinning it and a structured manifest. IPFS content is public; never upload secrets or personal information.

For Vercel deployment, configure `PINATA_JWT` and a random `UPLOAD_CHALLENGE_SECRET` of at least 32 characters as server-only environment variables. Configure both `VITE_IPFS_GATEWAY_URL` and a different `VITE_IPFS_FALLBACK_GATEWAY_URL` as public frontend variables. Use `vercel dev` when exercising the frontend and Functions locally; Vite alone does not host `/api`.

Reads currently go straight to the chain via multicall; the subgraph in `subgraph/` is the drop-in upgrade for job lists and the activity journal.

## Gas

The contract was written gas-consciously from the outset — tightly packed structs (the `Job` struct fits 5 slots), custom errors instead of `require` strings, `calldata` arrays, and pull-payments — so the meaningful savings were captured by design rather than a later pass. A deliberate post-hoc optimization merged `createJob`'s two loops (validate-and-sum, then store) into a single pass with an `unchecked` increment:

| Function | Before (avg) | After (avg) |
|---|---|---|
| `createJob` (2 milestones) | 172,184 | 171,995 |

The ~190-gas delta is small on purpose to report honestly: milestone `SSTORE`s dominate `createJob`'s cost and are unavoidable, so once the struct packing and custom errors were in place there was little left to win. Measured with `hardhat-gas-reporter` (`REPORT_GAS=true npx hardhat test`).

## Security

See [`SECURITY.md`](SECURITY.md) for the full threat model — reentrancy (pull-payments + CEI + `nonReentrant`), the pull-over-push griefing defense, the pause-excludes-withdraw circuit breaker, bounded iteration, the single-arbitrator trust assumption, owner powers and the hard fee cap, the arbitrator snapshot, and timestamp tolerance.

Static analysis (Slither, `crytic/slither-action`) runs in CI configured to fail on medium-or-higher findings; target is zero high/medium.

## IPFS uploads

Milestone deliverables and dispute evidence are pinned off-chain to IPFS via [Pinata](https://pinata.cloud). The CID stored on-chain identifies a JSON manifest containing the content CID, sanitized filename, MIME type, byte size, submitting wallet, job ID, milestone index, and timestamp. This preserves useful context while the file remains content-addressed.

`scripts/lib/ipfs.ts` is a small Node helper (native `fetch`/`FormData`/`Blob`, no extra dependencies) exposing `pinJson`, `pinFile`, and `cidUrl`. `scripts/pin-test.ts` is a manual smoke test — run it with `npx hardhat run scripts/pin-test.ts` after setting `PINATA_JWT` in `.env` (a free Pinata account is enough) to pin a sample deliverable and print its CID + gateway URL.

## Subgraph (Phase 13)

`subgraph/` is a hand-written [The Graph](https://thegraph.com) subgraph, with its own `package.json`/`node_modules` isolated from the Hardhat toolchain, that indexes every event of the deployed `FreelanceEscrow` contract (`0x85DBE339432cd7960FADFef78e2E6981025bD4BA` on Sepolia, from block `11287638`) into queryable entities:

- **Job** — client, freelancer, token, total amount, milestone count, timelock, lifecycle `state` (`FUNDED`/`IN_PROGRESS`/`COMPLETED`/`DISPUTED`/`CANCELLED`), USD-job fields.
- **Milestone** — per-job amount, `state` (`PENDING`/`SUBMITTED`/`APPROVED`/`DISPUTED`/`RESOLVED`/`AUTO_RELEASED`), deliverable CID, submission timestamp, fee. Amounts aren't carried in `JobCreated`, so the `handleJobCreated` mapping binds to the contract and calls `getMilestones(jobId)` to read them at index time.
- **Activity** — one row per state-changing event (job- or protocol-scoped), powering a frontend timeline.
- **Withdrawal**, **Dispute** — dedicated entities for the pull-payment and arbitration flows.

Build locally (from `subgraph/`):

```bash
cd subgraph
npm install --legacy-peer-deps
npm run codegen   # generates AssemblyScript bindings from the ABI + schema
npm run build      # compiles the mappings to WASM; the real correctness check
```

Deploy to Subgraph Studio (**[HUMAN]**, needs a Studio account + deploy key):

```bash
graph auth                       # paste your Subgraph Studio deploy key
npm run deploy                   # edit the `<SUBGRAPH_SLUG>` placeholder in package.json first
```

Sample query once synced:

```graphql
{
  jobs(first: 5, orderBy: createdAt, orderDirection: desc) {
    id
    state
    client
    freelancer
    totalAmount
    milestones {
      index
      state
      amount
    }
  }
}
```

## Status

This project is under active build-out. See `BLUEPRINT.md` at the repo root for the full, phase-by-phase implementation plan and live status.
