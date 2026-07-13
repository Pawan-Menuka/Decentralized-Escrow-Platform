# Decentralized Freelance Escrow Platform

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
- **Tier 3 — Advanced off-chain:** IPFS deliverable/evidence storage via Pinata, a Chainlink Functions integration that auto-approves milestones on a merged GitHub PR, and a The Graph subgraph for event-driven reads.
- **Tier 4 — Frontend:** a Vite + React + wagmi + RainbowKit dapp (client, freelancer, and arbitrator flows) reading from the subgraph, deployed to Vercel.

Total infrastructure cost target: **$0** (Sepolia faucets and free tiers throughout).

## Testing

`FreelanceEscrow.sol` has **105 passing Hardhat tests** across unit, integration, and attack suites (`test/*.ts`), plus dedicated attacker mocks in `contracts/mocks/` (`MaliciousReceiver`, `RevertingReceiver`).

- `npx hardhat test` — 105 passing (happy paths, full wrong-caller/wrong-state guard matrix, fee accounting to the wei, four integration lifecycles, reentrancy + pull-payment-DoS attack tests).
- `npx hardhat coverage` (`.solcover.js` skips `contracts/mocks`) — **96.88% lines, 92.86% branches** on `FreelanceEscrow.sol`.
- Attack tests prove: (1) a malicious freelancer contract that re-enters `withdraw()` from its own `receive()` gains nothing beyond its credited balance — the whole transaction reverts (`EthTransferFailed`), since `nonReentrant` + the zero-before-transfer (CEI) pattern block the reentrant call; (2) **the pull-payment thesis** — a freelancer contract that unconditionally reverts on receiving ETH can NEVER brick the client's `approveMilestone` (no external call is made there), only its own subsequent `withdraw()` fails, isolating the damage to the bad actor.
- Remaining uncovered branches are documented, not overlooked: two idempotent no-op guards in the internal scan-set helpers (`_addActive`/`_removeActive`) that are unreachable through the public API given the state-machine guards; the `createJobUsd` stub and its `_stub()` helper (Phase 8, not yet implemented); the `token != address(0)` ERC-20 branches in `withdraw`/`withdrawFees` (Phase 10, dead until ERC-20 support lands); and a few `nonReentrant` "already entered" branches on functions that make no external call themselves and so can only be reached via genuine cross-function reentrancy (not exercised — the only external-call surfaces, `withdraw`/`withdrawFees`, are the ones the attack tests target).

## Status

This project is under active build-out. See `BLUEPRINT.md` at the repo root for the full, phase-by-phase implementation plan and live status.
