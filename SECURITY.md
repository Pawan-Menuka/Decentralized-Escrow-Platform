# Security

## Scope & disclaimer

`FreelanceEscrow.sol` is a portfolio project deployed to the **Sepolia testnet only**. It has **not** been professionally audited and holds no real value. Do not deploy it to mainnet or entrust it with real funds without an independent audit.

This document is the threat model: it enumerates the attack surfaces that were considered, the mitigations in place, the trust assumptions the design deliberately accepts, and the known limitations left as future work.

## Trust model

| Actor | Trusted for | NOT trusted for |
|---|---|---|
| Client | Nothing beyond their own funds | Anything affecting the freelancer's earned funds — cannot claw back an approved milestone |
| Freelancer | Nothing | Cannot move funds except by withdrawing their own credited balance |
| Arbitrator | Splitting **disputed** milestone funds fairly | Anything on non-disputed jobs; cannot touch a job created before they were set (see snapshot below) |
| Owner (deployer) | Setting the fee (hard-capped) and pausing in an emergency | Cannot seize escrowed funds, cannot block withdrawals, cannot change the arbitrator of an existing job |

**Arbitration is per-job and chosen by the parties.** The client names an arbitrator when creating the job, and that address is snapshotted into it. The contract enforces that the arbitrator is a neutral third party — it can be neither the client nor the freelancer (`InvalidArbitrator`). A protocol *default* arbitrator exists as a convenience (used only when a job is created with `address(0)`), but no job is ever forced to use it, and the owner can never change the arbitrator of an existing job.

The trust assumption is therefore scoped: a job's arbitrator is trusted **only by the two parties who selected them, and only over that job's disputed milestones**. Multi-arbitrator / decentralized arbitration (e.g. Kleros) remains future work.

## Attack surfaces & mitigations

### Reentrancy
All value transfers use the **pull-payment** pattern: state-changing functions credit `pendingWithdrawals`/`accruedFees` and never call an external recipient. The only functions that transfer ETH out — `withdraw` and `withdrawFees` — follow **Checks-Effects-Interactions** (zero the balance *before* the external `.call`) and carry OpenZeppelin's `nonReentrant` guard. A reentrant call therefore finds a zeroed balance and a tripped guard; the outer low-level call observes the failure and reverts the whole transaction. Proven by `test/FreelanceEscrow.attacks.ts` ("reentrancy immunity"), where a `MaliciousReceiver` that re-enters `withdraw` from its `receive()` gains nothing.

### Griefing via a malicious recipient (pull-over-push)
If milestone approval *pushed* ETH to the freelancer, a freelancer contract that reverts on receipt could make `approveMilestone` always revert — permanently bricking the job's state machine. Because approval only **credits an internal balance**, a hostile recipient cannot block it; the failure is confined to that recipient's own later `withdraw`. Proven by `test/FreelanceEscrow.attacks.ts` ("pull-payment DoS resistance"), where approval succeeds against a `RevertingReceiver` freelancer.

### Circuit breaker excludes withdrawals
`pause()` halts every state-changing entry point **except `withdraw`**. This is intentional: pausing must never trap users' already-credited funds. `withdraw` is the one non-`whenNotPaused` state-changing function, verified by a test that withdraws successfully while paused.

### Denial of service via unbounded iteration
Jobs are capped at `MAX_MILESTONES = 50`, bounding every per-job loop (`createJob`, dispute bookkeeping). The Chainlink Automation scan set (`activeSubmitted`, Phase 9) is a compact array maintained with **swap-and-pop** and an index map, so upkeep never iterates over all jobs or over terminal milestones. `checkUpkeep` will additionally bound its scan per call.

### Reject-griefing
A client can repeatedly `rejectMilestone`, forcing the freelancer to resubmit indefinitely without ever approving. This is an accepted V1 limitation. The freelancer's recourse is `raiseDispute` (a rejected milestone can be resubmitted and then disputed), and the **time-lock** protects the *inverse* attack (a client who goes silent). A future version could cap rejections per milestone.

### Timestamp manipulation
Time-lock expiry uses `block.timestamp`. Miners/proposers can nudge it by a few seconds; the time-locks operate on the scale of days (`MIN_TIMELOCK = 1 hour`, up to 90 days), so a ±15s tolerance is immaterial. No logic depends on fine-grained timing.

### Arbitrator snapshot & neutrality
Each job stores the arbitrator resolved **at creation time** — either the one the client explicitly named, or the protocol default if none was given. `setArbitrator` only changes the *default*, and so only affects *future* jobs that opt into it. This prevents the owner from swapping in a colluding arbitrator to steal an in-flight disputed job's funds. Proven by tests where (a) the snapshotted arbitrator retains authority after the global default changes, and (b) an explicitly-named arbitrator can resolve that job's dispute end-to-end.

`_resolveArbitrator` additionally rejects an arbitrator equal to the client or the freelancer (`InvalidArbitrator`), so a job can never be created with a self-dealing "neutral" party.

### Fee bounds
`feeBps` is hard-capped at `MAX_FEE_BPS = 500` (5%) in both the constructor and `setFeeBps`; a malicious/compromised owner cannot set a confiscatory fee. The fee is read at release time and applies only to freelancer-bound funds (approval, auto-release, and the freelancer's share of a dispute) — never to client refunds or cancellations.

### Fee-on-transfer tokens (Phase 10)
When ERC-20 support lands, `createJob` will measure the balance actually received by `transferFrom` and **reject** any token that delivers less than requested (fee-on-transfer / rebasing tokens), rather than silently under-funding the escrow. ETH-only until then (`token` must be `address(0)`).

### Value conservation / solvency
The core safety property is that the contract can always pay everything it owes: `address(this).balance >= Σ unreleased milestone allocations + Σ pendingWithdrawals + accruedFees` (per token). Fund-on-create guarantees full funding up front; every release moves value from "escrowed" to "withdrawable" without creating or destroying any. This is asserted continuously by the Foundry invariant suite (`foundry/test/`).

## Design decisions that reduce risk

- **Fund-on-create** (no separate `fundJob`): removes a limbo state where a freelancer could accept an unfunded job. Funding and creation are atomic.
- **Immutable contract** (no proxy/UUPS): an escrow arguably *should* be immutable for trust, and it eliminates storage-collision and upgrade-key risk. The trade-off is that fixing a bug requires a redeploy.
- **Custom errors throughout**: cheaper and more precise than `require` strings.

## Static analysis

Slither runs in CI (`.github/workflows/ci.yml`, `crytic/slither-action`) on every push, configured to **fail on medium-or-higher** severity findings. `slither.config.json` filters `node_modules` and `contracts/mocks`. (Slither is run in CI rather than locally because its native dependencies require a C toolchain not present on the Windows dev machine.)

**Result: zero high/medium findings.** The remaining low/informational findings are reviewed and accepted:

- **Low-level call** in `withdraw` / `withdrawFees` (`msg.sender.call{value:...}("")`) — this is the intentional pull-payment ETH transfer, guarded by CEI + `nonReentrant`. Using `.call` (rather than `transfer`/`send`) is the recommended pattern post-EIP-1884.
- **`block.timestamp` comparison** in `claimTimelockRelease` — intended; the time-lock operates on the scale of hours-to-days, where a few seconds of miner tolerance is immaterial (see "Timestamp manipulation" above).
- **Naming convention** on `setFeeBps(_feeBps)` / `setArbitrator(_arbitrator)` — leading-underscore parameter names, a deliberate convention to distinguish them from the same-named state variables. Cosmetic.
- **Unindexed address event** — reported against OpenZeppelin's `Pausable.Paused/Unpaused` events, i.e. library code, not this contract.
- **Unused return** on `latestRoundData()` in `_readEthUsdPrice` — a known Chainlink false positive: the price feed returns a 5-tuple and the contract deliberately uses only `answer` and `updatedAt` (both validated), skipping `roundId`/`startedAt`/`answeredInRound`. Suppressed inline with `slither-disable-next-line unused-return` and justified at the call site.

## Known limitations / future work

- Arbitration rests on a single party-chosen arbitrator per job (→ decentralized/multi-arbitrator arbitration).
- No cap on client rejections per milestone (→ reject-griefing mitigation).
- ETH-only until Phase 10 (→ ERC-20/USDC).
- Testnet only; unaudited.

## Reporting

This is a personal portfolio project. For questions, open an issue on the repository.
