# Decentralized Freelance Escrow Platform

[![CI](https://github.com/Pawan-Menuka/Decentralized-Escrow-Platform/actions/workflows/ci.yml/badge.svg)](https://github.com/Pawan-Menuka/Decentralized-Escrow-Platform/actions/workflows/ci.yml)

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

`FreelanceEscrow.sol` has **137 passing Hardhat tests** across unit, integration, ERC-20, and attack suites (`test/*.ts`), plus dedicated mocks in `contracts/mocks/` (`MaliciousReceiver`, `RevertingReceiver`, `MockERC20`, `FeeOnTransferERC20`) and a Chainlink `MockV3Aggregator` for price-feed tests.

- `npx hardhat test` — 137 passing (happy paths, full wrong-caller/wrong-state guard matrix, fee accounting to the wei, integration lifecycles, reentrancy + pull-payment-DoS attack tests, USD price-feed conversion incl. staleness/invalid-price handling, Chainlink Automation check/perform upkeep incl. batching + forged-data re-validation, and a full ERC-20/USDC lifecycle).
- `npx hardhat coverage` (`.solcover.js` skips `contracts/mocks`) — **98.95% statements, 93.69% branches, 100% functions, 100% lines** on `FreelanceEscrow.sol`.
- **ERC-20/USDC support (Phase 10):** `createJob` accepts either native ETH (`token == address(0)`) or any ERC-20 token, pulling the total via `SafeERC20.safeTransferFrom` and crediting/withdrawing per-token throughout (`pendingWithdrawals`/`accruedFees` are already keyed by token). Fee-on-transfer and rebasing tokens are explicitly rejected: `createJob` measures the escrow's own balance delta around the transfer and reverts `TokenAmountMismatch` if it falls short of the requested total, rather than silently under-funding a job. `test/FreelanceEscrow.erc20.ts` covers the full lifecycle (create/accept/submit/approve/withdraw, dispute split, cancel refund) in a `MockERC20`, the `FeeOnTransferERC20` rejection, and an ETH-job + token-job coexisting in the same contract with independent balances/fees.
- Attack tests prove: (1) a malicious freelancer contract that re-enters `withdraw()` from its own `receive()` gains nothing beyond its credited balance — the whole transaction reverts (`EthTransferFailed`), since `nonReentrant` + the zero-before-transfer (CEI) pattern block the reentrant call; (2) **the pull-payment thesis** — a freelancer contract that unconditionally reverts on receiving ETH can NEVER brick the client's `approveMilestone` (no external call is made there), only its own subsequent `withdraw()` fails, isolating the damage to the bad actor.
- Remaining uncovered branches are documented, not overlooked: two idempotent no-op guards in the internal scan-set helpers (`_addActive`/`_removeActive`) that are unreachable through the public API given the state-machine guards; and a few `nonReentrant` "already entered" branches on functions that make no external call themselves and so can only be reached via genuine cross-function reentrancy (not exercised — the only external-call surfaces, `withdraw`/`withdrawFees`, are the ones the attack tests target).

### Fuzz / invariant tests (Foundry)

A hybrid Foundry suite (`foundry/test/`) runs property-based invariant tests via a bounded stateful handler that drives random full-lifecycle sequences:

- **Conservation** — the escrow's ETH balance always equals `deposited − withdrawn − feesWithdrawn`; no wei is created, destroyed, or stranded.
- **Solvency** — the balance is always ≥ every outstanding withdrawable balance plus accrued fees (the contract can always pay what it owes).
- **Fee cap** — `feeBps` never exceeds `MAX_FEE_BPS`, even though the handler calls `setFeeBps` with unbounded random values.

These run in CI on every push (`forge test`).

## Gas

The contract was written gas-consciously from the outset — tightly packed structs (the `Job` struct fits 5 slots), custom errors instead of `require` strings, `calldata` arrays, and pull-payments — so the meaningful savings were captured by design rather than a later pass. A deliberate post-hoc optimization merged `createJob`'s two loops (validate-and-sum, then store) into a single pass with an `unchecked` increment:

| Function | Before (avg) | After (avg) |
|---|---|---|
| `createJob` (2 milestones) | 172,184 | 171,995 |

The ~190-gas delta is small on purpose to report honestly: milestone `SSTORE`s dominate `createJob`'s cost and are unavoidable, so once the struct packing and custom errors were in place there was little left to win. Measured with `hardhat-gas-reporter` (`REPORT_GAS=true npx hardhat test`).

## Security

See [`SECURITY.md`](SECURITY.md) for the full threat model — reentrancy (pull-payments + CEI + `nonReentrant`), the pull-over-push griefing defense, the pause-excludes-withdraw circuit breaker, bounded iteration, the single-arbitrator trust assumption, owner powers and the hard fee cap, the arbitrator snapshot, and timestamp tolerance.

Static analysis (Slither, `crytic/slither-action`) runs in CI configured to fail on medium-or-higher findings; target is zero high/medium.

## Status

This project is under active build-out. See `BLUEPRINT.md` at the repo root for the full, phase-by-phase implementation plan and live status.
