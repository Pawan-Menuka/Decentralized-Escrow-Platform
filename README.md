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

## Status

This project is under active build-out. See `BLUEPRINT.md` at the repo root for the full, phase-by-phase implementation plan and live status.
