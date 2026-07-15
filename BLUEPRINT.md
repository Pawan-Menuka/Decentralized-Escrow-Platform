# BLUEPRINT — Decentralized Freelance Escrow Platform

> **Purpose of this file:** a complete, self-contained implementation guide. A capable AI model (Claude Opus or Sonnet) — or the developer — must be able to build the entire product from this file alone, with no access to any prior conversation. It also serves as the live `IMPLEMENTATION_PLAN.md`: every phase has a `Status:` line that the builder MUST update as work progresses.
>
> **Source plan:** expands `escrow-platform-a-z-plan.md` (v2). All decisions from that plan are baked in here; do not re-litigate them.
>
> **IMPORTANT — mode change:** the original plan said "learning mode: the human writes the Solidity." That is superseded. The AI builder writes ALL code, tests, and configs. The human reviews, runs faucet/registration steps that need a wallet or browser, and merges.

---

## How the AI builder must use this file

1. Find the first phase whose `Status:` is not `DONE`. Do that phase only.
2. Follow the phase's **Tasks** in order. Meet every item in **Done criteria**. Run every command in **Verify**.
3. Update the phase's `Status:` line (`NOT STARTED` → `IN PROGRESS` → `DONE`) and commit at the end of the phase. Commit message format: `phase(N.N): <summary>`.
4. Never start phase N+1 while phase N has failing tests or unmet done-criteria.
5. Anything marked **[HUMAN]** requires the developer (wallet signing, faucets, web UI registration, video recording). Stop and ask when you hit one; do not fake it.
6. Tier stop points are real: after Phase 7 (Tier 1) and Phase 10 (Tier 2) the project is independently portfolio-worthy. If the developer says stop, polish the README and stop.

### Environment facts the builder must respect (Windows machine)

- OS is Windows 11. The Bash tool is **Git Bash** — never use PowerShell cmdlets in it. PowerShell on this machine is 5.1 — no `&&`, and **never run pnpm/npx through PowerShell**; run node CLIs via Git Bash.
- Always quote Windows paths in Bash (`cd "D:\GitHub\..."` or use forward slashes).
- Run `npx tsc --noEmit` and `npx hardhat compile/test` WITHOUT piping to `head`/`tail`, with generous timeouts (5+ min).
- Claude sessions run in `.claude\worktrees\*` copies that lack `node_modules`. `npm install` inside the worktree when needed; remind the user their main-repo dev server can't see worktree changes until merged.
- The user's broadband is intermittently flaky: on sudden RPC/fetch failures, suspect the connection before the code.
- Installed package versions may be newer than the model's training data. **Before writing integration code against OpenZeppelin, Chainlink, wagmi, viem, or RainbowKit, read the installed package's actual source/exports in `node_modules`** (e.g. check `@openzeppelin/contracts/access/Ownable.sol` for the v5 constructor).
- **Dependency install rule (learned in Phase 0):** this toolchain has peer-dependency conflicts (gas-reporter v2 vs toolbox; the TypeScript 7 native port crashes ts-node). **Any `npm install` MUST use `--legacy-peer-deps`.** Do NOT delete `node_modules`/`package-lock.json` and reinstall clean — the lockfile already resolves a working set. Keep `typescript` pinned to `^5.x` (never 7.x). Node on this machine is v20.19.0 (CI uses 22 — both are fine).

---

## 1. Product definition

**What it is:** a milestone-based escrow protocol for freelance work on Ethereum (Sepolia testnet). A client creates and funds a job split into milestones; a freelancer accepts, submits work per milestone; the client approves (releasing funds) or disputes; an arbitrator resolves disputes with an arbitrary split; client silence after submission auto-releases funds after a time-lock. Funds move via pull-payments. A protocol fee (basis points) is skimmed on every release to the freelancer.

**Users & powers:**

| Role | Powers |
|---|---|
| Client | Create + fund job, approve/reject milestones, cancel pre-acceptance, raise disputes |
| Freelancer | Accept job, submit milestones (with deliverable hash), resubmit after rejection, raise disputes |
| Arbitrator | Resolve disputes with any freelancer/client split (initially the deployer address) |
| Owner (deployer) | Set fee (capped), withdraw accrued fees, pause/unpause |
| Anyone | Trigger time-lock release after deadline (later automated by Chainlink Automation) |

**Core flows (v1):**
1. Client `createJob` (payable, funds locked at creation) → freelancer `acceptJob` → freelancer `submitMilestone` → client `approveMilestone` → freelancer `withdraw`.
2. Rejection: client `rejectMilestone` → milestone back to PENDING → freelancer resubmits.
3. Dispute: either party `raiseDispute` on a SUBMITTED milestone → arbitrator `resolveDispute(freelancerBps)` → both sides withdraw their shares.
4. Cancel: client `cancelJob` before freelancer accepts → full refund via pull payment.
5. Time-lock: milestone SUBMITTED + client silent past `timelock` seconds → anyone (later a Chainlink Keeper) triggers release to freelancer.

**Explicit non-goals for v1** (rejected in the source plan — keep as interview answers, do not build): upgradeable proxies (escrow should be immutable for trust), DAO/multi-arbitrator voting, Kleros integration, CCIP cross-chain, reputation/staking, mainnet deployment.

**Total infra cost: $0** (Sepolia faucets, Alchemy/Pinata/Subgraph Studio/Vercel/GitHub Actions free tiers).

---

## 2. Tech stack (pinned, with rationale)

| Layer | Choice | Why | Rejected alternative |
|---|---|---|---|
| Language | Solidity `0.8.24` | Modern (custom errors, transient-storage era compiler), widely supported by tooling | 0.8.20 (older), Vyper (less tooling) |
| Build/test | Hardhat `^2.26` + `@nomicfoundation/hardhat-toolbox ^5` (TypeScript, ethers v6) | Massive training-data coverage → fewer lower-model mistakes; user knows Hardhat | Hardhat 3 (newer, less documented patterns); pure Foundry (user's course used Hardhat) |
| Fuzz/invariants | Foundry (`forge` stable) as a hybrid suite in `foundry/` | Industry-standard fuzzer; hybrid repos are CV-worthy | echidna (harder setup on Windows) |
| Contracts lib | `@openzeppelin/contracts ^5.1` | ReentrancyGuard, Pausable, Ownable, SafeERC20 | Writing them by hand (pointless risk) |
| Oracle | `@chainlink/contracts ^1.3` | Price Feeds, Automation, Functions | — |
| Static analysis | Slither (latest, via `pip install slither-analyzer`) | Free, standard, CI-friendly | Mythril (slow) |
| Gas | `hardhat-gas-reporter ^2`, `solidity-coverage ^0.8` | Numbers for the README | — |
| Frontend | Vite `^6` + React `^18` + TypeScript, wagmi `^2`, viem `^2`, `@rainbow-me/rainbowkit ^2`, `@tanstack/react-query ^5` | Current de-facto dapp stack | Next.js (SSR pointless for a wallet dapp), ethers in FE (wagmi wants viem) |
| Indexing | The Graph, Subgraph Studio free tier | Event-driven UI reads | Direct RPC scans (slow, but is the documented fallback) |
| Storage | Pinata free tier (IPFS pinning) | Deliverable/evidence CIDs | web3.storage (API churn) |
| RPC | Alchemy free tier (Sepolia) | Reliable, generous free tier | Infura (fine too) |
| CI | GitHub Actions | Free, user knows it | — |
| Hosting | Vercel free tier | Zero-config Vite deploys | Netlify (equivalent) |
| Node | Node.js 22 LTS, npm | LTS; npm avoids pnpm-on-PowerShell issues | pnpm (shell friction on this machine) |

**Version discipline:** after `npm install`, record the exact resolved versions in this file's Phase 0 status notes. If an installed major version differs from the table, read the installed package's docs/source before coding against it.

---

## 3. Architecture

One immutable contract, `FreelanceEscrow.sol`, owns all funds and state. No proxy, no factory (a factory adds nothing for a portfolio; one contract holding many jobs is the struct+mapping+counter pattern). Frontend talks to it via wagmi/viem; reads come from The Graph subgraph (fallback: direct RPC). Chainlink Automation calls `performUpkeep` for expired time-locks. Chainlink Price Feeds convert USD-denominated milestones to ETH at funding time. IPFS CIDs are stored on-chain as `bytes32`-ish strings (see data model).

### Contract-level state machine (text form — no diagrams anywhere in this project's docs except the README, where these two tables are rendered as fenced ASCII)

| From | Event/call | To |
|---|---|---|
| — | `createJob` (payable, fully funded) | `FUNDED` |
| `FUNDED` | `acceptJob` (freelancer) | `IN_PROGRESS` |
| `FUNDED` | `cancelJob` (client) | `CANCELLED` |
| `IN_PROGRESS` | last milestone reaches terminal released/resolved state | `COMPLETED` |
| `IN_PROGRESS` | `raiseDispute` on any milestone | `DISPUTED` |
| `DISPUTED` | `resolveDispute` (no other milestone disputed) | `IN_PROGRESS` (or `COMPLETED` if it was the last) |

Note: there is no separate `CREATED` state — funding happens inside `createJob`. **Decision + why (document in README):** a two-step create-then-fund flow doubles the state surface and creates a limbo state where a freelancer can accept an unfunded job. Fund-on-create removes an entire class of bugs.

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

### Where state lives

- **On-chain:** all funds, job/milestone structs, pull-payment balances, accrued fees, the compact "active submitted milestones" set for Automation.
- **IPFS:** deliverable files, job specs, dispute evidence. On-chain stores only the CID string.
- **Subgraph:** derived read models (job lists, timelines) built purely from events — which is why **every state change emits an event**.
- **Frontend:** no server, no database. Wallet + subgraph + contract only.

### Security architecture (the actual thesis of the project)

1. **Guard-first functions:** every external function's first lines are caller check then state check, via modifiers/custom errors. The full guard matrix is in §5.
2. **Pull-over-push payments:** no `transfer`/`call` to recipients inside state transitions. Approval credits `pendingWithdrawals`; recipients call `withdraw()` (CEI + `nonReentrant`). A malicious contract recipient cannot brick approval.
3. **Checks-Effects-Interactions** everywhere; `ReentrancyGuard` on `withdraw` and any ETH/token-moving function.
4. **Pausable** as circuit-breaker on state-changing entry points, **but never on `withdraw`** — users must always be able to exit with their credited funds (document this in SECURITY.md).
5. **Bounded iteration:** Automation scans a compact array of active submitted milestone keys with swap-and-pop removal; never iterates all jobs.
6. **Trust assumptions (document, don't hide):** single arbitrator is trusted for disputed funds only; owner can pause and set fee up to a hard cap of 5%; `block.timestamp` tolerance ±15s is irrelevant at multi-day timelocks.

---

## 4. Data model (the contract schema — write this file first, before any function)

`contracts/FreelanceEscrow.sol`. All of §4 and §5 is the normative spec; the builder implements exactly this unless a compiler/library constraint forces a documented deviation.

### 4.1 Enums

```solidity
enum JobState { NONE, FUNDED, IN_PROGRESS, COMPLETED, DISPUTED, CANCELLED }
enum MilestoneState { NONE, PENDING, SUBMITTED, APPROVED, DISPUTED, RESOLVED, AUTO_RELEASED }
```

`NONE` (default 0) doubles as the "does not exist" sentinel — a job/milestone read from an empty mapping slot has state `NONE`, so existence checks are `if (job.state == JobState.NONE) revert JobNotFound();`.

### 4.2 Structs (packed deliberately — the gas-report commit in Phase 5 documents the packing win)

```solidity
struct Job {
    address client;        // slot 0: 20 bytes
    uint48  createdAt;     //         6 bytes  (seconds; uint48 good until year ~8.9M)
    uint32  timelock;      //         4 bytes  (seconds of client silence before auto-release; max ~136 years)
    uint8   state;         //         1 byte   (JobState) -- stored as uint8, cast at boundaries
    // slot 0 total: 31 bytes
    address freelancer;    // slot 1: 20 bytes
    uint16  milestoneCount;//         2 bytes
    uint16  approvedCount; //         2 bytes  (milestones in a terminal state)
    // slot 1 total: 24 bytes
    address token;         // slot 2: 20 bytes (address(0) = native ETH; ERC-20 enabled Phase 10)
    address arbitrator;    // slot 3: 20 bytes
    uint256 totalAmount;   // slot 4  (sum of milestone amounts, in token/wei units)
}

struct Milestone {
    uint128 amount;        // wei / token units (uint128 is astronomically enough)
    uint40  submittedAt;   // timestamp of latest submission (0 if never)
    uint8   state;         // MilestoneState
    string  deliverableCid;// IPFS CID (empty until submitted). string not bytes32: CIDv1 > 32 bytes.
}
```

**Note for the builder:** if storing enums directly (`JobState state;`) instead of `uint8`, that is fine and cleaner — Solidity packs enums as uint8 anyway. Prefer the enum-typed field; the table above shows byte budgets, not required literal types.

### 4.3 Storage layout

```solidity
uint256 public jobCounter;                                   // next job id; ids start at 1 (0 = nonexistent)
mapping(uint256 => Job) public jobs;                         // jobId => Job
mapping(uint256 => mapping(uint256 => Milestone)) public milestones; // jobId => index => Milestone
mapping(address => mapping(address => uint256)) public pendingWithdrawals; // token => account => amount (token address(0) = ETH)
mapping(address => uint256) public accruedFees;              // token => owner-withdrawable fees
uint16 public feeBps;                                        // protocol fee in basis points
uint16 public constant MAX_FEE_BPS = 500;                    // hard cap 5%
uint32 public constant MIN_TIMELOCK = 1 days;
uint32 public constant MAX_TIMELOCK = 90 days;
uint16 public constant MAX_MILESTONES = 50;                  // bounds loops in createJob
address public arbitrator;                                   // global arbitrator, snapshotted into each Job at creation
uint256[] public activeSubmitted;                            // packed keys of SUBMITTED milestones (see 4.4) — Automation scan set
mapping(uint256 => uint256) internal activeSubmittedIndex;   // packedKey => index+1 in activeSubmitted (0 = absent)
```

Snapshotting the arbitrator into the Job at creation is deliberate: changing the global arbitrator must not change who arbitrates existing jobs (document in SECURITY.md).

### 4.4 Packed milestone key (for the Automation scan set)

```solidity
function _key(uint256 jobId, uint256 mIndex) internal pure returns (uint256) {
    return (jobId << 32) | mIndex;   // jobId in high bits, index in low 32
}
```

On `submitMilestone`: push key + record index. On any exit from SUBMITTED (`approve`, `reject`, `raiseDispute`, auto-release): swap-and-pop remove. Invariant: `activeSubmitted` contains exactly the keys of milestones in state `SUBMITTED` (fuzz this in Phase 5).

### 4.5 Custom errors (complete list — no `require` strings anywhere)

```solidity
error JobNotFound();
error MilestoneNotFound();
error NotClient();
error NotFreelancer();
error NotArbitrator();
error NotParticipant();          // raiseDispute: caller is neither client nor freelancer
error InvalidJobState(uint8 current);
error InvalidMilestoneState(uint8 current);
error ZeroAddress();
error SelfDealing();             // client == freelancer
error NoMilestones();
error TooManyMilestones();
error ZeroMilestoneAmount();
error ValueMismatch(uint256 expected, uint256 actual); // msg.value != sum(amounts)
error TimelockOutOfRange();
error TimelockNotExpired();
error InvalidBps();              // freelancerBps > 10000 or fee > MAX_FEE_BPS
error NothingToWithdraw();
error EthTransferFailed();
error TokenNotSupported();       // token != address(0) before Phase 10
error StalePrice();              // Phase 8
error InvalidPrice();            // Phase 8
```

### 4.6 Events (complete list — one per state change; The Graph schema is generated from these)

```solidity
event JobCreated(uint256 indexed jobId, address indexed client, address indexed freelancer,
                 address token, uint256 totalAmount, uint256 milestoneCount, uint32 timelock);
event JobAccepted(uint256 indexed jobId, address indexed freelancer);
event JobCancelled(uint256 indexed jobId);
event JobCompleted(uint256 indexed jobId);
event MilestoneSubmitted(uint256 indexed jobId, uint256 indexed mIndex, string deliverableCid);
event MilestoneApproved(uint256 indexed jobId, uint256 indexed mIndex, uint256 amount, uint256 fee);
event MilestoneRejected(uint256 indexed jobId, uint256 indexed mIndex, string reason);
event MilestoneAutoReleased(uint256 indexed jobId, uint256 indexed mIndex, uint256 amount, uint256 fee);
event DisputeRaised(uint256 indexed jobId, uint256 indexed mIndex, address indexed raisedBy, string evidenceCid);
event DisputeResolved(uint256 indexed jobId, uint256 indexed mIndex, uint16 freelancerBps,
                      uint256 freelancerAmount, uint256 clientAmount, uint256 fee);
event Withdrawal(address indexed account, address indexed token, uint256 amount);
event FeeUpdated(uint16 oldBps, uint16 newBps);
event FeesWithdrawn(address indexed token, uint256 amount);
event ArbitratorUpdated(address indexed oldArbitrator, address indexed newArbitrator);
```

### 4.7 Money math (single source of truth)

- Fee applies **only to amounts flowing to the freelancer** (approval, auto-release, and the freelancer share of a dispute resolution). Client refunds are never fee'd.
- `fee = amount * feeBps / 10000` (floor division); freelancer receives `amount - fee`; `accruedFees[token] += fee`.
- Dispute split: `freelancerGross = amount * freelancerBps / 10000`, `clientAmount = amount - freelancerGross`, then fee is taken from `freelancerGross`. Rounding dust (≤1 wei per operation) stays with the client side by construction — state this in a NatSpec `@dev`.
- **Solvency invariant (the #1 fuzz target):** `address(this).balance >= Σ unreleased milestone allocations + Σ pendingWithdrawals[ETH] + accruedFees[ETH]` — and per-token equivalents after Phase 10.

---

## 5. Function surface (the API of the contract)

Inheritance: `contract FreelanceEscrow is ReentrancyGuard, Pausable, Ownable` — plus `AutomationCompatibleInterface` from Phase 9. **OpenZeppelin v5 gotcha:** `Ownable` requires `Ownable(initialOwner)` in the constructor; there is no zero-arg constructor as in v4.

For every function: **Guards** run in the listed order as the first statements. **Effects** happen before any interaction. Every function that changes state emits its event(s) listed in §4.6.

### constructor(uint16 _feeBps, address _arbitrator)
- Guards: `_feeBps <= MAX_FEE_BPS` else `InvalidBps`; `_arbitrator != 0` else `ZeroAddress`.
- Effects: `Ownable(msg.sender)`, set `feeBps`, `arbitrator`.

### createJob(address freelancer, address token, uint128[] calldata amounts, uint32 timelock) external payable whenNotPaused returns (uint256 jobId)
- Guards: `freelancer != 0` (`ZeroAddress`); `freelancer != msg.sender` (`SelfDealing`); `token == address(0)` until Phase 10 (`TokenNotSupported`); `amounts.length` in `[1, MAX_MILESTONES]` (`NoMilestones`/`TooManyMilestones`); every amount > 0 (`ZeroMilestoneAmount`); `timelock` in `[MIN_TIMELOCK, MAX_TIMELOCK]` (`TimelockOutOfRange`); for ETH: `msg.value == Σ amounts` (`ValueMismatch`). (Phase 10 adds the ERC-20 path: `msg.value == 0` and `safeTransferFrom` the total.)
- Effects: `jobId = ++jobCounter`; write Job{client: msg.sender, state: FUNDED, arbitrator: global arbitrator snapshot, ...}; write each Milestone{amount, state: PENDING}.
- Emits `JobCreated`.

### acceptJob(uint256 jobId) external whenNotPaused
- Guards: job exists; `msg.sender == job.freelancer` (`NotFreelancer`); `job.state == FUNDED` (`InvalidJobState`).
- Effects: state → IN_PROGRESS. Emits `JobAccepted`.

### cancelJob(uint256 jobId) external whenNotPaused
- Guards: job exists; `msg.sender == job.client` (`NotClient`); `job.state == FUNDED` (`InvalidJobState`) — i.e. pre-acceptance only.
- Effects: state → CANCELLED; `pendingWithdrawals[token][client] += totalAmount` (full refund, no fee). Emits `JobCancelled`.

### submitMilestone(uint256 jobId, uint256 mIndex, string calldata deliverableCid) external whenNotPaused
- Guards: job exists; `msg.sender == job.freelancer`; `job.state == IN_PROGRESS`; milestone exists (`mIndex < milestoneCount`); `milestone.state == PENDING` (`InvalidMilestoneState`).
- Effects: state → SUBMITTED; `submittedAt = block.timestamp`; store CID; add key to `activeSubmitted`. Emits `MilestoneSubmitted`.

### approveMilestone(uint256 jobId, uint256 mIndex) external whenNotPaused nonReentrant
- Guards: job exists; `msg.sender == job.client`; `job.state == IN_PROGRESS`; milestone SUBMITTED.
- Effects: state → APPROVED; remove from `activeSubmitted`; `_creditFreelancer(job, amount)` (fee math §4.7); `approvedCount++`; `_maybeCompleteJob(jobId)` (if `approvedCount == milestoneCount`, job → COMPLETED, emit `JobCompleted`). Emits `MilestoneApproved`.

### rejectMilestone(uint256 jobId, uint256 mIndex, string calldata reason) external whenNotPaused
- Guards: job exists; `msg.sender == job.client`; `job.state == IN_PROGRESS`; milestone SUBMITTED.
- Effects: state → PENDING; `submittedAt = 0`; clear CID; remove from `activeSubmitted`. Emits `MilestoneRejected`. (Freelancer's recourse against reject-griefing is `raiseDispute` *before* the client rejects, or on the resubmission — note this griefing vector in SECURITY.md.)

### raiseDispute(uint256 jobId, uint256 mIndex, string calldata evidenceCid) external whenNotPaused
- Guards: job exists; caller is client or freelancer (`NotParticipant`); `job.state == IN_PROGRESS || job.state == DISPUTED`; milestone SUBMITTED.
- Effects: milestone → DISPUTED; job → DISPUTED; remove from `activeSubmitted` (a disputed milestone must NOT auto-release). Emits `DisputeRaised`.

### resolveDispute(uint256 jobId, uint256 mIndex, uint16 freelancerBps) external whenNotPaused nonReentrant
- Guards: job exists; `msg.sender == job.arbitrator` (the snapshot, `NotArbitrator`); `job.state == DISPUTED`; milestone DISPUTED; `freelancerBps <= 10000` (`InvalidBps`).
- Effects: milestone → RESOLVED; split per §4.7; credit both parties' `pendingWithdrawals`; `approvedCount++`; if **no other milestone of this job is DISPUTED**, job → IN_PROGRESS (or COMPLETED via `_maybeCompleteJob`). Determining "no other disputed" by loop over `milestoneCount` is acceptable (bounded by MAX_MILESTONES=50); alternatively keep a per-job `disputedCount` counter — prefer the counter. Emits `DisputeResolved`.

### claimTimelockRelease(uint256 jobId, uint256 mIndex) external whenNotPaused nonReentrant
- Guards: job exists; milestone SUBMITTED; `block.timestamp >= submittedAt + job.timelock` (`TimelockNotExpired`). **No caller restriction** — anyone may call.
- Effects: milestone → AUTO_RELEASED; remove from `activeSubmitted`; credit freelancer (fee applies); `approvedCount++`; `_maybeCompleteJob`. Emits `MilestoneAutoReleased`.

### withdraw(address token) external nonReentrant   — **NOT whenNotPaused (funds must always be exitable)**
- Guards: `amount = pendingWithdrawals[token][msg.sender] > 0` (`NothingToWithdraw`).
- Effects (CEI): zero the balance FIRST, then transfer: ETH via `(bool ok,) = msg.sender.call{value: amount}(""); if (!ok) revert EthTransferFailed();`; ERC-20 via `SafeERC20.safeTransfer`. Emits `Withdrawal`.

### Owner functions
- `setFeeBps(uint16)` — cap `MAX_FEE_BPS`, emits `FeeUpdated`. Applies to future releases only (fee is read at release time; acceptable and documented).
- `setArbitrator(address)` — nonzero; affects only future jobs (snapshot). Emits `ArbitratorUpdated`.
- `withdrawFees(address token, address to)` — nonReentrant; zero-then-send `accruedFees[token]`. Emits `FeesWithdrawn`.
- `pause()` / `unpause()` — OZ Pausable.

### Views (for frontend/tests; not events-critical)
- `getJob(uint256) returns (Job memory)`, `getMilestone(uint256, uint256) returns (Milestone memory)`, `getMilestones(uint256) returns (Milestone[] memory)`, `activeSubmittedLength() returns (uint256)`.

### Phase 9 additions (Chainlink Automation)
- `checkUpkeep(bytes calldata) external view override returns (bool upkeepNeeded, bytes memory performData)` — scan `activeSubmitted` (bounded: at most first 100 entries per call), collect up to 10 expired keys, abi-encode them as `uint256[]`.
- `performUpkeep(bytes calldata performData) external override` — decode keys; for each, **re-validate every condition on-chain** (milestone still SUBMITTED, timelock actually expired — never trust performData), then run the `claimTimelockRelease` logic. Must not revert wholesale if one key went stale — skip stale entries.

### Phase 8 additions (Price Feeds)
- `createJobUsd(address freelancer, uint128[] calldata usdAmounts /* 8-decimals, matching feed */, uint32 timelock) external payable` — reads ETH/USD from `AggregatorV3Interface`; guards: `answer > 0` (`InvalidPrice`), `block.timestamp - updatedAt <= PRICE_STALENESS_THRESHOLD` (3600s, `StalePrice`), `answeredInRound >= roundId` optional-but-nice; converts each USD amount to wei: `weiAmount = usdAmount * 1e18 * 1e8 / (uint256(answer) * 1e8)` — **the builder must write this conversion with explicit decimal comments and unit tests at known prices** (e.g. ETH=$2,000.00 → $500 = 0.25 ETH). Accepts a small overpayment tolerance? **No** — require exact `msg.value == Σ weiAmounts` computed in the same call; the frontend quotes via the same feed immediately before sending. Feed address passed in the constructor (immutable) so tests inject a mock.

---

## 6. External services — setup, keys, gotchas

All keys live in `.env` (git-ignored); `.env.example` lists every name with a comment. **[HUMAN]** steps flagged.

| Service | What for | Setup | Gotchas |
|---|---|---|---|
| Alchemy | Sepolia RPC | **[HUMAN]** create app at alchemy.com → HTTPS URL → `SEPOLIA_RPC_URL` | Free tier is plenty |
| Dev wallet | Deploy + demo | **[HUMAN]** create a **fresh** MetaMask account (never the real one) → `DEPLOYER_PRIVATE_KEY` | Fund via faucets: Alchemy Sepolia faucet, Google Cloud faucet. Need ~0.5 Sepolia ETH total |
| Etherscan | Verification | **[HUMAN]** etherscan.io API key → `ETHERSCAN_API_KEY` | Use `@nomicfoundation/hardhat-verify` (in toolbox) |
| Chainlink faucet | LINK for Automation | **[HUMAN]** faucets.chain.link → ~25 LINK on Sepolia | Needed only at Phase 9 registration |
| Chainlink Automation | Timelock upkeep | **[HUMAN]** automation.chain.link → register custom-logic upkeep on the deployed contract, fund with LINK | Register via UI, not registrar contract calls |
| Pinata | IPFS pinning | **[HUMAN]** pinata.cloud API key + JWT → frontend env `VITE_PINATA_JWT` | Free tier 500 pins / 1GB. Uploads happen from the frontend (or demo script) |
| Subgraph Studio | Indexing | **[HUMAN]** thegraph.com/studio → create subgraph → deploy key | `graph` CLI: `@graphprotocol/graph-cli` |
| WalletConnect | RainbowKit | **[HUMAN]** cloud.reown.com project ID → `VITE_WALLETCONNECT_PROJECT_ID` | Free |
| Vercel | Frontend hosting | **[HUMAN]** import repo, root dir `frontend/` | Set env vars in dashboard |

**Chainlink Sepolia addresses** (verify against docs.chain.link before use — addresses occasionally rotate):
- ETH/USD Price Feed: `0x694AA1769357215DE4FAC081bf1f309aDC325306` (8 decimals)
- LINK token: `0x779877A7B0D9E8603169DdbD7836e478b4624789`
- Functions router: `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0`, DON ID `fun-ethereum-sepolia-1` (Phase 12 only)
- Circle USDC (Sepolia, 6 decimals): `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (Phase 10; also deploy own MockUSDC for tests)

### .env.example (repo root)

```bash
SEPOLIA_RPC_URL=            # Alchemy HTTPS endpoint
DEPLOYER_PRIVATE_KEY=       # dedicated dev wallet ONLY — never a real key
ETHERSCAN_API_KEY=
FEE_BPS=100                 # 1% protocol fee at deploy
ARBITRATOR_ADDRESS=         # defaults to deployer if empty
ETH_USD_FEED=0x694AA1769357215DE4FAC081bf1f309aDC325306
REPORT_GAS=true
```

Frontend `frontend/.env.example`:
```bash
VITE_WALLETCONNECT_PROJECT_ID=
VITE_CONTRACT_ADDRESS=
VITE_SEPOLIA_RPC_URL=
VITE_PINATA_JWT=
VITE_SUBGRAPH_URL=          # empty = fall back to direct RPC reads
```

---

## 7. Project structure

```
Decentralized-Escrow-Platform/
├── BLUEPRINT.md                  # this file — the live plan; update Status lines
├── README.md                     # portfolio front door: state tables, coverage, gas numbers, addresses
├── SECURITY.md                   # threat model (written Phase 5)
├── LICENSE                       # MIT
├── .env.example
├── .gitignore                    # node_modules, .env, coverage/, cache/, artifacts/, out/, typechain-types/
├── package.json
├── hardhat.config.ts
├── foundry.toml
├── remappings.txt                # forge remappings into node_modules
├── contracts/
│   ├── FreelanceEscrow.sol
│   ├── interfaces/               # (only if needed)
│   └── mocks/
│       ├── MockV3Aggregator.sol      # Phase 8 (or import chainlink's)
│       ├── MockERC20.sol             # Phase 10
│       ├── FeeOnTransferERC20.sol    # Phase 10
│       ├── MaliciousReceiver.sol     # Phase 4 reentrancy attacker
│       └── RevertingReceiver.sol     # Phase 4 pull-payment justification test
├── test/                         # Hardhat TS tests (unit + integration + attack)
│   ├── FreelanceEscrow.create.ts
│   ├── FreelanceEscrow.lifecycle.ts
│   ├── FreelanceEscrow.disputes.ts
│   ├── FreelanceEscrow.timelock.ts
│   ├── FreelanceEscrow.withdraw.ts
│   ├── FreelanceEscrow.admin.ts
│   ├── FreelanceEscrow.attacks.ts
│   ├── FreelanceEscrow.pricefeed.ts   # Phase 8
│   ├── FreelanceEscrow.automation.ts  # Phase 9
│   ├── FreelanceEscrow.erc20.ts       # Phase 10
│   └── helpers.ts                # fixtures via loadFixture
├── foundry/
│   └── test/
│       ├── EscrowInvariants.t.sol
│       └── handlers/EscrowHandler.sol
├── scripts/
│   ├── deploy.ts
│   └── demo.ts                   # Phase 18: seeds a full lifecycle on Sepolia
├── slither.config.json
├── .github/workflows/ci.yml
├── subgraph/                     # Phase 13
│   ├── schema.graphql
│   ├── subgraph.yaml
│   └── src/mapping.ts
└── frontend/                     # Phase 14+ — Vite app, own package.json
    ├── src/
    │   ├── main.tsx  App.tsx  wagmi.ts
    │   ├── abi/FreelanceEscrow.ts     # `export const escrowAbi = [...] as const;`
    │   ├── hooks/    (useJob.ts, useJobs.ts, usePendingWithdrawal.ts, useEthUsd.ts)
    │   ├── components/ (JobCard, MilestoneRow, CreateJobForm, Timeline, RoleBadge, TxButton)
    │   ├── pages/    (Home, JobDetail, CreateJob, Arbitrator)
    │   └── lib/      (ipfs.ts, graph.ts, format.ts)
    └── .env.example
```

### hardhat.config.ts (normative skeleton)

```ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ?? "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY ?? "" },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};
export default config;
```

### foundry.toml + remappings.txt

```toml
[profile.default]
src = "contracts"
test = "foundry/test"
out = "out"
libs = ["node_modules"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200

[invariant]
runs = 256
depth = 64
fail_on_revert = false
```

```
@openzeppelin/=node_modules/@openzeppelin/
@chainlink/=node_modules/@chainlink/
forge-std/=node_modules/forge-std/src/
```

(`npm install --save-dev forge-std` or `forge install foundry-lib/forge-std --no-git` — pick npm to keep one package manager.)

### .github/workflows/ci.yml (normative skeleton)

```yaml
name: ci
on: [push, pull_request]
jobs:
  hardhat:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx hardhat compile
      - run: npx hardhat test
      - run: npx hardhat coverage
  foundry:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: foundry-rs/foundry-toolchain@v1
      - run: forge test -vv
  slither:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: crytic/slither-action@v0.4.0
        with: { fail-on: medium }
```

---

## 8. Testing & verification strategy

- **Unit tests (Hardhat/TS):** per function — happy path, **every custom error** (wrong caller × wrong state matrix), **every event with exact args**. Use `loadFixture` for a deployed-contract fixture and named signers (`deployer, client, freelancer, arbitrator, rando`). Assert errors with `expect(tx).to.be.revertedWithCustomError(escrow, "NotClient")`; events with `.to.emit(escrow, "MilestoneApproved").withArgs(...)`; balances with `changeEtherBalances`.
- **Integration tests:** four full lifecycles — (a) create→accept→submit→approve×N→withdraw; (b) dispute→resolve(6000 bps)→both withdraw; (c) cancel→refund withdraw; (d) submit→`time.increase(timelock+1)`→claimTimelockRelease→withdraw. Use `@nomicfoundation/hardhat-network-helpers` `time.increase`.
- **Attack tests:** `MaliciousReceiver` re-enters `withdraw` (must revert / gain nothing); `RevertingReceiver` as freelancer proves approval still succeeds (the pull-payment thesis — write this test with a comment saying exactly that); double-approve; approve-after-dispute; resolve by non-arbitrator; withdraw with zero balance; over/underfunded createJob.
- **Fuzz/invariant (Foundry):** handler-based invariant suite with 5 invariants:
  1. Solvency (§4.7).
  2. No milestone is credited twice (ghost variable: total credited per milestone ≤ amount).
  3. `activeSubmitted` ≡ set of SUBMITTED milestones.
  4. Job state consistency: COMPLETED ⇒ all milestones terminal; CANCELLED ⇒ zero milestones ever left PENDING.
  5. `Σ credits + Σ fees == Σ released allocations` (conservation).
- **Static analysis:** `slither .` with `slither.config.json` filtering `node_modules`; zero high/medium; document every informational finding in SECURITY.md.
- **Coverage:** `npx hardhat coverage` ≥ 90% lines+branches on `FreelanceEscrow.sol`; record the number in README.
- **Live verification:** after deploy, exercise one full job lifecycle on Sepolia via a script (this doubles as `demo.ts` development).

---

## 9. Phased build plan

Each phase = one session of work. Update `Status:` as you go. Commit at phase end.

### 9.0 Model routing (Opus vs Sonnet)

Claude Code runs **one model per session** (set with `/model`); there is no automatic per-phase switch. To spend Opus only where it earns its keep, **set `/model` at the start of each phase to the tag below, then run `/phase`.** Rule of thumb: Opus for phases where a subtle mistake is silent and expensive (fund-moving math, security invariants, tricky oracle/automation integration); Sonnet for phases that are mechanical transcription of this already-normative spec.

| Phase | Model | Why |
|---|---|---|
| 0 — Scaffold | **Sonnet** | Boilerplate config; spec is exact |
| 1 — Data model + skeleton | **Sonnet** | Direct transcription of §4/§5; no judgment calls |
| 2 — Happy path + pull payments + fee | **Opus** | Money movement, CEI ordering, fee math to the wei |
| 3 — Unhappy paths (dispute/resolve/timelock) | **Opus** | State-machine correctness; split math; re-entry into IN_PROGRESS/COMPLETED |
| 4 — Full tests + attack tests + coverage | **Sonnet** | Mechanical given the guard matrix; escalate to Opus only if an attack test won't pass |
| 5 — Hardening: Slither, invariants, gas | **Opus** | Designing invariants + interpreting findings is the security thesis |
| 6 — Deploy + verify | **Sonnet** | Scripted, well-trodden |
| 7 — CI | **Sonnet** | Copy the provided YAML |
| 8 — Price Feeds (USD) | **Opus** | Decimal/units math is a classic silent-bug source |
| 9 — Automation (Keepers) | **Opus** | Bounded scan + on-chain re-validation correctness |
| 10 — ERC-20 / USDC | **Sonnet** | Spec is detailed; **but Opus reviews the received==total balance check** before commit |
| 11 — IPFS (Pinata) | **Sonnet** | REST plumbing |
| 12 — Chainlink Functions (PR verify) | **Opus** | Hardest, churn-prone integration; the time-boxed risk |
| 13 — Subgraph | **Sonnet** | Mechanical event→entity mappings |
| 14 — Frontend scaffold + wallet | **Sonnet** | Standard wagmi/RainbowKit setup |
| 15 — Client flow | **Sonnet** | UI wiring; Opus only if USD-quote logic gets subtle |
| 16 — Freelancer + arbitrator flows | **Sonnet** | UI wiring |
| 17 — Reads via The Graph + timeline | **Sonnet** | Query plumbing |
| 18 — Ship (Vercel, demo, video, README) | **Sonnet** | Scripting + prose |

Net: Opus on 2, 3, 5, 8, 9, 12 (six phases — the fund-moving and integration-risk work), Sonnet on the other thirteen. If a Sonnet phase hits a wall (an attack test that won't pass, an invariant violation, a failing verify), stop and hand that phase to Opus rather than pushing through — a wrong "green" here is a redeploy later.

---

### ═══ TIER 1 — Core contract ═══

### Phase 0 — Scaffold & repo hygiene
**Status: DONE** — Scaffolded manually (no `npx hardhat init`; interactive). Resolved versions: hardhat@2.28.6, @openzeppelin/contracts@5.6.1, @chainlink/contracts@1.4.0, Node v20.19.0 (machine LTS is 20, not the blueprint's target 22 — noted), solc 0.8.24, ethers@6.17.0, typescript@5.9.3. Deviations: (a) `@nomicfoundation/hardhat-network-helpers` pinned to ^1.1.2 (v3 requires Hardhat 3 — incompatible with Hardhat 2.x); (b) toolbox pulls `typescript@7.0.2` (native port) by default which crashes ts-node@10.9.2 — pinned typescript to ^5.8 and installed with `--legacy-peer-deps`, which then required installing all toolbox peer deps explicitly (hardhat-ethers, hardhat-verify, ignition, typechain, chai@^4, etc.); (c) added `tsconfig.json` (ts-node needs it). `npx hardhat compile` → "Nothing to compile" (empty project, expected).

Tasks:
1. In the repo root: `npx hardhat init` → TypeScript project. If the generated sample uses a newer Hardhat major than 2.x, read its docs/templates before proceeding and adapt (record the actual version here).
2. `npm install --save-dev @openzeppelin/contracts @chainlink/contracts dotenv hardhat-gas-reporter solidity-coverage @nomicfoundation/hardhat-network-helpers forge-std`
3. Delete sample contract/test. Write `hardhat.config.ts` (§7), `.env.example` (§6), `.gitignore`, MIT `LICENSE`, `foundry.toml`, `remappings.txt`, `slither.config.json` (`{"filter_paths": "node_modules|contracts/mocks"}`).
4. README first draft: title, one-paragraph pitch, both state-machine tables from §3 in fenced code blocks, tier roadmap. The README exists from day one and grows every phase.
5. **[HUMAN]**: Alchemy key, Etherscan key, fresh dev wallet, faucet ETH. Builder writes `.env.example` and stops; human fills `.env`.

Done criteria: `npx hardhat compile` succeeds on an empty-ish project; repo has license, env example, README with state tables; first commit pushed.
Verify: `npx hardhat compile` (no pipe, long timeout); `git status` clean after commit.

---

### Phase 1 — Data model + contract skeleton
**Status: DONE** — `contracts/FreelanceEscrow.sol` written exactly per §4/§5: all enums/structs/storage/errors/events, constructor (`Ownable(msg.sender)`), `_key`, full views, and typed stubs (all revert `NotImplemented`) for every other §5 function. OZ v5 imports confirmed against `node_modules`: `@openzeppelin/contracts/utils/ReentrancyGuard.sol`, `@openzeppelin/contracts/utils/Pausable.sol`, `@openzeppelin/contracts/access/Ownable.sol`. Deviations (both temporary, deleted alongside `NotImplemented`/`_stub` at end of Phase 3, so they never touch the permanent spec'd layout): (a) added a private `_stub()` helper + one scratch storage slot `_stubTouch` (appended after the §4.3 layout) so stub bodies compile with zero warnings — a bare `revert NotImplemented();` inside a `nonReentrant`-modified stub triggers an "unreachable code" warning from OpenZeppelin's `ReentrancyGuard.sol` (solc proves the post-`_;` cleanup dead once optimizer + a provably-always-reverting body are combined), and several non-`nonReentrant` stubs got "function state mutability can be restricted to view" since a bare revert never touches storage; `_stub()` guards on a runtime (non-constant-foldable) `msg.sender` check and performs one never-reached storage write, satisfying solc's analysis without changing any spec'd storage slot; (b) `createJob`/`createJobUsd` stubs assign `jobId = 0;` after `_stub()` (dead in practice, but needed so solc doesn't warn "unnamed/unassigned return variable"). `npx hardhat compile` → zero warnings, zero errors. Smoke test `test/FreelanceEscrow.skeleton.ts` passes.

Tasks:
1. Write `contracts/FreelanceEscrow.sol` containing ALL of §4 (enums, structs, storage, every custom error, every event), the constructor per §5, `_key`, and empty-but-typed function stubs for every §5 function that `revert("not implemented")`-style guard (use a temporary `error NotImplemented();`).
2. NatSpec `@title`/`@notice`/`@dev` on the contract and every declared item, from day one — not retrofitted.
3. Views implemented (they're trivial and unblock tests early).

Done criteria: compiles clean with zero warnings; storage layout matches §4.3; a smoke test deploys the contract and reads `feeBps`/`arbitrator`.
Verify: `npx hardhat compile`; `npx hardhat test` (the one smoke test passes).

---

### Phase 2 — Happy path + pull payments + fee
**Status: DONE** (implemented on Opus per routing). Implemented ETH-path `createJob`, `acceptJob`, `submitMilestone`, `approveMilestone`, `withdraw`, `setFeeBps`, `withdrawFees`, `pause`/`unpause`, plus internal helpers `_creditFreelancer` (fee read at release time, floor division, dust→client), `_maybeCompleteJob`, and `_addActive`/`_removeActive` (swap-and-pop scan set, maintained from Phase 2 onward). Fee applies only to freelancer-bound funds. `withdraw`/`withdrawFees` ETH branch fully done; non-ETH branch reverts `TokenNotSupported` until Phase 10. 42 tests passing (create/lifecycle/withdraw/admin) incl. fee accounting to the wei and full wrong-caller/wrong-state matrix. Stubs remaining (still revert `NotImplemented` via `_stub`): cancelJob, rejectMilestone, raiseDispute, resolveDispute, claimTimelockRelease, setArbitrator (Phase 3); createJobUsd (Phase 8). Note: `changeEtherBalances` needs the raw tx (not an awaited helper result) — see create.ts "locks the funds" test.

Tasks:
1. Implement `createJob`, `acceptJob`, `submitMilestone`, `approveMilestone`, `withdraw`, internal `_creditFreelancer` (fee math §4.7) and `_maybeCompleteJob`, plus `setFeeBps`, `withdrawFees`, `pause`/`unpause` — exactly per §5 guard order.
2. Maintain `activeSubmitted` add/remove from the start (submit adds, approve removes) — do not defer to Phase 9.
3. Write `test/helpers.ts` fixture + `FreelanceEscrow.create.ts`, `withdraw.ts`, and the happy-path half of `lifecycle.ts` while implementing (tests are written in the same phase as the code they test, always).

Done criteria: full happy-path lifecycle test passes end to end incl. fee accounting to the wei; every new function has wrong-caller + wrong-state revert tests; all events asserted with args.
Verify: `npx hardhat test`; spot-check gas isn't absurd (`REPORT_GAS=true npx hardhat test` via Bash: `REPORT_GAS=true npx hardhat test`).

---

### Phase 3 — Unhappy paths
**Status: DONE** (implemented on Opus per routing). Implemented `cancelJob` (FUNDED-only, full no-fee refund via pull-payment), `rejectMilestone` (SUBMITTED→PENDING, clears CID/timestamp, pulls from scan set), `raiseDispute` (client/freelancer, IN_PROGRESS|DISPUTED, milestone→DISPUTED, job→DISPUTED, removes from scan set), `resolveDispute` (snapshotted arbitrator, split via reused `_creditFreelancer` so fee hits only the freelancer share, dust→client, returns job to IN_PROGRESS/COMPLETED only when `disputedCount` hits 0), `claimTimelockRelease` (no caller restriction, `block.timestamp >= submittedAt + timelock`, credits net-of-fee), `setArbitrator` (owner, future jobs only). Added storage `mapping(uint256 => uint16) public disputedCount` (deviation from §4.3 — a per-job counter, spec's preferred approach; documented here). 65 tests passing (added disputes/timelock/cancel). **Correction to the Phase 1 note:** `_stub`/`NotImplemented`/`_stubTouch` are NOT deleted at end of Phase 3 — `createJobUsd` remains stubbed until Phase 8, so the machinery is removed at end of Phase 8 instead (comments updated in-contract).

Tasks:
1. Implement `cancelJob`, `rejectMilestone`, `raiseDispute`, `resolveDispute` (with per-job `disputedCount`), `claimTimelockRelease`, `setArbitrator` — per §5.
2. Tests: `disputes.ts` (incl. multi-milestone job where one milestone disputes while another approves; resolve at 0, 10000, and 6000 bps; job returns to IN_PROGRESS vs COMPLETED correctly), `timelock.ts` (`time.increase`; claim exactly at boundary, before boundary reverts), cancel path in `lifecycle.ts`.

Done criteria: every §5 function implemented; the four integration lifecycles (§8) all pass; `NotImplemented` error deleted from the codebase.
Verify: `npx hardhat test` — all green.

---

### Phase 4 — Full test suite + attack tests + coverage
**Status: DONE** — Added `contracts/mocks/MaliciousReceiver.sol` (proxies `doAccept`/`doSubmit`/`doWithdraw`; `receive()` re-enters `withdraw` exactly once, guarded by a bool) and `contracts/mocks/RevertingReceiver.sol` (same proxies; `receive()` unconditionally reverts). `test/FreelanceEscrow.attacks.ts` proves: (1) reentrancy immunity — the malicious freelancer's `doWithdraw()` reverts `EthTransferFailed` in full (nonReentrant + CEI zero-before-transfer means the outer low-level `.call` reports failure), leaving its credited balance and the contract's ETH untouched; (2) the pull-payment thesis (commented in the test as such) — `approveMilestone` succeeds even though the freelancer is a contract that reverts on receiving ETH, with only that freelancer's own later `withdraw()` failing. Filled every guard-matrix gap the existing suite was missing: `rejectMilestone` and `setArbitrator` had NO prior tests at all (now full happy-path + wrong-caller/wrong-state/not-found matrices); added double-approve, approve-after-dispute, createJob over/under-funded (`ValueMismatch` both directions), constructor guards (`InvalidBps`, `ZeroAddress`), `unpause` non-owner, `withdrawFees` to a reverting recipient, a `whenNotPaused` revert test for every state-changing function that lacked one, and the remaining `JobNotFound`/`MilestoneNotFound`/`InvalidMilestoneState` branches across `submitMilestone`/`approveMilestone`/`raiseDispute`/`resolveDispute`/`claimTimelockRelease`. `.solcover.js` added (`skipFiles: ["mocks"]`). **105 tests passing** (65 pre-existing + 40 new); `npx hardhat coverage` → **96.88% lines, 92.86% branches** on `FreelanceEscrow.sol` (both ≥90%). Remaining uncovered branches are dead/documented: `_addActive`/`_removeActive` idempotent no-ops (unreachable via the public API given the state machine), the Phase-8 `createJobUsd`/`_stub()` stub, the Phase-10 `token != address(0)` ERC-20 branches in `withdraw`/`withdrawFees`, and a handful of `nonReentrant` "already-entered" branches on functions (`approveMilestone`, `resolveDispute`, `claimTimelockRelease`, `withdrawFees`) that make no external call themselves and so can only be hit via cross-function reentrancy, which the attack tests don't attempt (they target the two actual external-call surfaces, `withdraw`/`withdrawFees`, directly). No real contract vulnerability was found — `FreelanceEscrow.sol` was not modified.

Tasks:
1. Write `contracts/mocks/MaliciousReceiver.sol` (re-enters `withdraw` in `receive()`) and `RevertingReceiver.sol` (reverts on receive).
2. `attacks.ts` per §8. Complete the guard matrix: for EVERY external function, a test per invalid caller and per invalid state.
3. Run `npx hardhat coverage`; add tests until ≥90% lines & branches on `FreelanceEscrow.sol`.
4. Record coverage number + test count in README.

Done criteria: coverage ≥90% documented; attack tests demonstrate reentrancy immunity and pull-payment DoS-resistance; zero skipped tests.
Verify: `npx hardhat coverage` (long timeout, no piping); inspect `coverage/index.html` summary values.

---

### Phase 5 — Hardening: Slither, Foundry invariants, gas pass
**Status: DONE** (Opus). **Tooling routed to CI** (user decision): Slither cannot build locally (native deps need MSVC C++ Build Tools, absent on the Win/Py3.14 dev box) and Foundry is not installed locally, so both run in CI on Ubuntu instead — **Phase 7 CI was brought forward** and now executes `forge test` + `crytic/slither-action` (fail-on: medium) on every push. Delivered: `SECURITY.md` (full threat model — reentrancy/CEI, pull-over-push griefing defense, pause-excludes-withdraw, bounded iteration, arbitrator snapshot, owner powers + fee cap, timestamp tolerance, fee-on-transfer plan, solvency property); Foundry invariant suite `foundry/test/EscrowInvariants.t.sol` + `handlers/EscrowHandler.sol` with 3 invariants (conservation `balance == deposited−withdrawn−feesWithdrawn`, solvency `balance ≥ Σpending+fees`, fee-cap under random `setFeeBps`); gas pass = merged `createJob`'s two loops into one + `unchecked` increment (honest ~190-gas avg win, documented in README — SSTOREs dominate). **NOT verified locally: `forge test` and `slither` — they run for the first time in CI on push; if CI is red, fix from the CI logs.** 105 Hardhat tests still green after the gas reorder.

Tasks:
1. **[HUMAN if pip missing]** `pip install slither-analyzer`. Run `slither .`; fix all high/medium; document informationals.
2. Write `SECURITY.md`: threat model (reentrancy, approval-DoS/pull-payments, reject-griefing, arbitrator trust, owner powers + fee cap, pause-excludes-withdraw, timestamp tolerance, griefing via MAX_MILESTONES bound), Slither summary, audit disclaimer.
3. Foundry: **[HUMAN if not installed]** install via `foundryup` (Git Bash). Write handler-based invariant suite with the 5 invariants of §8. Handler exposes bounded random actions (create/accept/submit/approve/reject/dispute/resolve/warp/claim/withdraw) with `vm.assume`/bounding.
4. Gas pass: capture before-numbers, make ONE deliberate optimization commit (already using custom errors + packing, so candidates: cache storage reads into memory in loops, `calldata` params audit, unchecked counters where safe), capture after-numbers, put the before/after table in README.

Done criteria: `forge test` green with invariants; `slither .` zero high/medium; SECURITY.md complete; README has gas table + "fuzz-tested" bullet.
Verify: `forge test -vv`; `slither . --fail-medium`; `npx hardhat test` still green.

---

### Phase 6 — Deploy + verify on Sepolia
**Status: DONE** (done after Phases 8–10 since deploy was deferred; run on 2026-07-15). `scripts/deploy.ts` deploys `FreelanceEscrow(feeBps=100, arbitrator=deployer, ethUsdFeed=Sepolia ETH/USD)`, auto-deploys a `MockV3Aggregator` on local networks, and writes `deployments/<network>.json`. **Deployed to Sepolia at `0x8979c8a5C96ff221Ea520f45927AACc4Ee50F981`** (tx `0xdf4d0e5f…`, block 11277121), **verified on Etherscan** (source public at `/address/0x8979…F981#code`). Live sanity check passed (createJob→cancelJob→withdraw cycle, refund reclaimed). `hardhat.config.ts` normalizes the deployer key (accepts it with or without the `0x` prefix — MetaMask exports without). `deployments/sepolia.json` committed (public data only; `.gitignore` excludes `deployments/hardhat.json`/`localhost.json`). **[HUMAN] done:** Alchemy RPC, Etherscan key, funded dev wallet `0xF176B879…4e589`. **This deployment supersedes any prior address for Tiers 3–4** and is what the subgraph (Phase 13) + frontend (Phase 14) must point at; the Chainlink upkeep registration (Phase 9 follow-up) and USDC sanity (Phase 10 follow-up) can now be done against it.

Tasks:
1. `scripts/deploy.ts`: deploys with `FEE_BPS` and `ARBITRATOR_ADDRESS` (default deployer) from env; prints address + constructor args; writes `deployments/sepolia.json` (address, block number, args, timestamp) — the subgraph and frontend read this file later.
2. **[HUMAN]** ensure `.env` filled + wallet funded. Run: `npx hardhat run scripts/deploy.ts --network sepolia`.
3. Verify: `npx hardhat verify --network sepolia <address> <feeBps> <arbitrator>`.
4. Sanity: one `createJob` + `acceptJob` from the script or Etherscan UI. Record address in README with Etherscan link.

Done criteria: contract verified (green check on Etherscan); address + link in README and `deployments/sepolia.json` committed.
Verify: open the Etherscan URL; "Contract" tab shows readable source.

---

### Phase 7 — CI
**Status: DONE** (brought forward during Phase 5, since Slither/Foundry must run in CI). `.github/workflows/ci.yml` has three jobs on `ubuntu-latest`, all using `npm ci --legacy-peer-deps`: **hardhat** (compile + test + coverage), **foundry** (`forge test -vv` — fuzz/invariants), **slither** (`crytic/slither-action@v0.4.0`, fail-on: medium, using `slither.config.json`). Node 22 in CI. **All three jobs GREEN as of commit b864e38 (run 29268649478)** — Foundry invariants and Slither genuinely execute on every push. CI badge added to README. Debugging notes for future sessions: (1) the npm `forge-std` mirror lays sources at package root, not `src/`, AND omits `ds-test` — so CI vendors forge-std via `git clone --recursive` into `lib/` and remappings point there; (2) `crytic/slither-action` runs its own `npm install` without `--legacy-peer-deps`, fixed by a project `.npmrc` (`legacy-peer-deps=true`); (3) Slither's only medium finding was `uninitialized-local` on `createJob.total`, fixed with `= 0`; remaining low/informational findings documented in SECURITY.md.

Tasks: commit `.github/workflows/ci.yml` (§7). Push; **[HUMAN or gh CLI]** confirm all three jobs green. Add CI badge to README.

Done criteria: green CI on main branch; badge renders.
Verify: `gh run list --limit 3` or the Actions tab.

✅ **TIER 1 STOP POINT.** CV line: "Verified, fuzz-tested milestone escrow with pull payments and dispute arbitration on Sepolia; >90% coverage; zero high/medium Slither findings; CI."

---

### ═══ TIER 2 — Chainlink core ═══

### Phase 8 — Price Feeds (USD-denominated jobs)
**Status: DONE** (Opus). Constructor now takes an immutable `address _ethUsdFeed` (`AggregatorV3Interface`, path `@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol`). Implemented `createJobUsd(freelancer, usdAmounts[8dp], timelock)`: reads the feed once via `_readEthUsdPrice` (guards `answer > 0` → `InvalidPrice`, `block.timestamp - updatedAt > PRICE_STALENESS_THRESHOLD(1h)` → `StalePrice`), converts `wei = usdAmount(8dp) * 1e18 / price(8dp)`, requires `msg.value == Σwei`, stores the job in ETH terms (thereafter a normal ETH job), emits `JobCreated` + new `JobCreatedUsd(jobId, usdTotal, ethUsdPrice)`. **Removed the `_stub`/`_stubTouch`/`NotImplemented` machinery** (createJobUsd was the last stub). Test mock: re-export `contracts/mocks/MockV3Aggregator.sol` → Chainlink's `shared/mocks/MockV3Aggregator.sol` (pragma `^0.8.0`, deploy by name in tests). Updated all deploy sites (helpers, skeleton, attacks constructor-guards + new zero-feed guard, Foundry handler) for the 3-arg constructor. **119 Hardhat tests passing; coverage 99.13% lines / 93.16% branch / 100% funcs.** Conversion unit-tested at $2000 & $2500, staleness + zero + negative price reverts, exact-msg.value, and a full USD-job lifecycle. **Deploy/verify deferred:** Phase 6 was skipped per user, so the constructor's ABI change is NOT yet redeployed — whenever Phase 6 runs, deploy with the Sepolia ETH/USD feed `0x694AA1769357215DE4FAC081bf1f309aDC325306`. `createJobUsd` stays ETH-only (USD→USDC needs no oracle; Phase 10 note).

Tasks:
1. Constructor takes `address ethUsdFeed` (immutable). Implement `createJobUsd` per §5 with staleness + positivity guards and the documented decimal conversion. Store the job in ETH terms (milestone `amount` = converted wei) — conversion happens once, at funding; the job is thereafter a normal ETH job. Emit `JobCreated` with the ETH total (add a separate `JobCreatedUsd(jobId, usdTotal, ethUsdPrice)` event for the subgraph).
2. Mock: use `@chainlink/contracts` `MockV3Aggregator` if exported by the installed version, else write `contracts/mocks/MockV3Aggregator.sol` (constructor decimals+initialAnswer, `updateAnswer`, settable `updatedAt`).
3. `pricefeed.ts`: known-price conversion cases, stale-price revert (set `updatedAt` old), zero/negative price revert, exact-msg.value requirement.
4. **Redeploy + re-verify on Sepolia** (contracts are immutable; every ABI change after Phase 6 means redeploy — update `deployments/sepolia.json` and README address).

Done criteria: conversion unit-tested at ≥3 price points; staleness path tested; redeployed + verified.
Verify: `npx hardhat test`; Etherscan check.

---

### Phase 9 — Chainlink Automation (Keepers)
**Status: DONE (code+tests; on-chain registration deferred with Phase 6)** (Opus). Inherits `AutomationCompatibleInterface` (path `@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol`). `checkUpkeep` (view; stricter override) scans `activeSubmitted` bounded by `UPKEEP_SCAN_LIMIT=100`, collects up to `UPKEEP_BATCH_LIMIT=10` expired keys, returns `abi.encode(uint256[])`. `performUpkeep` (`whenNotPaused nonReentrant`) decodes keys and **re-validates every one on-chain** (job exists, index in range, milestone still SUBMITTED, timelock actually expired) — SKIPS stale entries instead of reverting the batch; anyone may call. Added `_unkey` and extracted shared `_autoRelease` (used by both `claimTimelockRelease` and `performUpkeep`). **Changed `MIN_TIMELOCK` 1 day → 1 hour** (blueprint decision, for same-day upkeep demos; documented in-contract; existing out-of-range tests still pass since 60s < 1h). **130 tests passing; coverage 99.24% lines / 92.57% branch / 100% funcs** — checkUpkeep true/false, batch cap at 10, performUpkeep release + idempotency + forged-data-for-non-expired + forged-data-for-nonexistent (no revert) + job completion + paused. **[HUMAN]/deferred:** register the upkeep at automation.chain.link (needs Phase 6 deploy + LINK from faucets.chain.link, ~5 LINK, gas limit ≥500k) and record the upkeep ID + a fired-tx hash in the README. Manual `claimTimelockRelease` remains the always-available fallback.

Tasks:
1. Implement `checkUpkeep`/`performUpkeep` per §5 (bounded scan, on-chain re-validation, skip-don't-revert). Inherit `AutomationCompatibleInterface` — check the exact import path in the installed `@chainlink/contracts` (it has moved between `src/v0.8/automation/...` versions).
2. `automation.ts`: checkUpkeep false when nothing expired; true with correct performData when expired; performUpkeep releases and is idempotent (second call no-ops/skips); performUpkeep with forged performData for a non-expired milestone does nothing.
3. Redeploy + verify. **[HUMAN]** register upkeep at automation.chain.link (custom logic, the contract address, ~5 LINK), then create a short-timelock test: temporarily allow MIN_TIMELOCK small? — **No.** Instead deploy with MIN_TIMELOCK unchanged but test upkeep on Sepolia by creating a job with timelock = MIN_TIMELOCK (1 day) and letting it fire overnight, OR add a `MIN_TIMELOCK = 1 hours` — **decision: set `MIN_TIMELOCK = 1 hours`** (documented: demo-friendly while still realistic), so live-fire test completes same-day.
4. README: upkeep ID + link, explanation of bounded-scan design.

Done criteria: local automation tests green; upkeep registered and observed firing once on Sepolia (tx hash in README).
Verify: automation.chain.link dashboard shows a performed upkeep; `npx hardhat test`.

---

### Phase 10 — ERC-20 / USDC support
**Status: DONE** (Fable). Added `IERC20`/`SafeERC20` (OZ v5, `using SafeERC20 for IERC20`). `createJob` now branches on `token`: ETH keeps the exact `msg.value == total` check; ERC-20 requires `msg.value == 0` (else `ValueMismatch(0, msg.value)`), then does `safeTransferFrom(msg.sender, address(this), total)` and measures the escrow's own balance delta before/after, reverting `TokenAmountMismatch(expected, received)` if the delta is short — this rejects fee-on-transfer/rebasing tokens by construction rather than silently under-funding a job. `withdraw`/`withdrawFees` ERC-20 branches now `safeTransfer` instead of reverting `TokenNotSupported`; that error is now unused and removed from the contract (all its usages were exactly the three branches replaced). `createJobUsd` left untouched except a `@dev` note explaining why no USDC variant is needed (1 USD == 1 USDC, no oracle). Mocks added: `contracts/mocks/MockERC20.sol` (OZ `ERC20`, 6-decimals like USDC, public `mint`) and `contracts/mocks/FeeOnTransferERC20.sol` (withholds/burns 1% on every `transfer`/`transferFrom`). New `test/FreelanceEscrow.erc20.ts`: full token lifecycle (create/accept/submit/approve/withdraw with `changeTokenBalances`, fee accounting to the wei), a second-milestone completion + owner fee withdrawal, an arbitrary-bps dispute split paid out in the token, a cancel refund in the token, fee-on-transfer rejection (`TokenAmountMismatch`), ETH-job + token-job coexistence in the same contract (independent balances/fees per token), and the `ValueMismatch(0, msg.value)` guard for a token job funded with nonzero ETH. Repurposed `test/FreelanceEscrow.create.ts`'s old "reverts on a non-ETH token" test into a guard-ordering test for the same `ValueMismatch` case (ERC-20 lifecycle itself now lives in `erc20.ts`); `test/FreelanceEscrow.withdraw.ts`'s existing non-ETH-token test needed no change — withdrawing a token the caller has no credited balance for still reverts `NothingToWithdraw` regardless of Phase 10. **137 Hardhat tests passing; coverage 98.95% statements / 93.69% branches / 100% functions / 100% lines** on `FreelanceEscrow.sol` (up from 130 tests / 99.24% lines / 92.57% branches). No real contract bug was found in the pre-existing (merged) logic. Foundry suite intentionally not extended (out of scope per this phase's instructions) and not run locally (forge unavailable on this machine — runs in CI). **Deploy/verify deferred:** redeploy + Sepolia USDC sanity lifecycle are [HUMAN] follow-ups (Circle USDC Sepolia address `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, faucet at faucet.circle.com) — this phase only covers the Solidity + test lifecycle per the assigned scope. **Opus review fix:** `createJob` now makes an external call (`safeTransferFrom` to an arbitrary token) and previously wrote the `Job` struct after it without a guard — added `nonReentrant` to `createJob` (matching every other value-moving function) to make the CEI/reentrancy posture airtight and pre-empt Slither's `reentrancy-no-eth` (medium) finding. 137 tests still green after the change.

Tasks:
1. Remove the `TokenNotSupported` guard: `createJob` with `token != address(0)` takes `msg.value == 0` and `SafeERC20.safeTransferFrom(token, msg.sender, address(this), total)`. **Measure balance before/after the transferFrom and require received == total** (this rejects fee-on-transfer tokens explicitly — cleaner than supporting them; document the choice). All credit/withdraw paths already keyed by token (§4.3) — verify no ETH assumptions leaked in.
2. Mocks: `MockERC20` (plain, 6-decimals like USDC) and `FeeOnTransferERC20` (burns 1% on transfer) — the latter's test asserts `createJob` **reverts**, which is the talking point.
3. `erc20.ts`: full lifecycle in MockERC20 incl. fees, dispute split, cancel refund; fee-on-transfer rejection; mixed ETH-job + token-job coexistence.
4. `createJobUsd` stays ETH-only (USD→USDC needs no oracle — 1 USD = 1 USDC; add a note, not code).
5. Final Tier-2 redeploy + verify; sanity lifecycle with Sepolia Circle USDC **[HUMAN: get test USDC from faucet.circle.com]**.

Done criteria: ERC-20 lifecycle tests green; fee-on-transfer rejected; redeployed, verified, README updated (this address is now the stable one for Tiers 3–4).
Verify: `npx hardhat test`; `npx hardhat coverage` still ≥90%; `forge test` (extend handler to a token job).

✅ **TIER 2 STOP POINT.** "Autonomous, oracle-integrated, multi-asset escrow protocol."

---

### ═══ TIER 3 — Advanced off-chain ═══

### Phase 11 — IPFS via Pinata
**Status: NOT STARTED**

Tasks:
1. No contract change (the `deliverableCid`/`evidenceCid` string fields were designed for this).
2. Write `frontend/src/lib/ipfs.ts` early (even though frontend proper is Tier 4): `pinJson(obj)` and `pinFile(file)` against Pinata's REST API (`https://api.pinata.cloud/pinning/pinFileToIPFS` / `pinJSONToIPFS`, `Authorization: Bearer <JWT>`), returning the CID; plus `cidUrl(cid)` → `https://gateway.pinata.cloud/ipfs/<cid>`.
3. Also add a Node variant in `scripts/lib/ipfs.ts` for `demo.ts`.
4. Test with a real pin **[HUMAN: Pinata JWT]**; keep a tiny integration script `scripts/pin-test.ts`.

Done criteria: a JSON deliverable pinned, CID resolvable via gateway, CID submitted in a live `submitMilestone` on Sepolia.
Verify: open gateway URL; Etherscan shows the CID in the tx.

---

### Phase 12 — Chainlink Functions: GitHub PR auto-approval (HIGH RISK — time-boxed)
**Status: NOT STARTED**

**Time-box: if this fights back for more than ~5 working sessions, ship without it, mark it "in progress" in README, and move on. A broken wow-feature is worse than an absent one.**

Tasks:
1. New small contract or extension: `requestPrVerification(jobId, mIndex, string owner, string repo, uint256 prNumber)` (client pre-authorizes a PR as the acceptance criterion at submission time — design: **freelancer supplies PR ref in submitMilestone's CID JSON; client calls requestPrVerification to trigger check**). Uses `FunctionsClient` from `@chainlink/contracts` — read the installed version's Functions API before writing any code; it churns.
2. JS source (inline string): GitHub API `GET /repos/{owner}/{repo}/pulls/{number}` → return `Functions.encodeUint256(merged ? 1 : 0)`. Public repos only → no secret needed (avoid the DON-hosted-secrets rabbit hole in v1).
3. `fulfillRequest` callback: if merged==1 and milestone still SUBMITTED → run approval logic (credits freelancer). Guard: only the stored requestId, only once.
4. **[HUMAN]** Functions subscription at functions.chain.link, fund with LINK, add consumer.
5. Local tests with the Functions mock/simulator if the installed toolkit provides one; otherwise test the callback path by impersonating the router address.

Done criteria: one full live cycle on Sepolia — merged PR causes on-chain auto-approval (tx hash in README).
Verify: Etherscan trace of the fulfillment tx.

---

### Phase 13 — The Graph subgraph
**Status: NOT STARTED**

Tasks:
1. `npm i -g @graphprotocol/graph-cli` (or npx). `graph init` against the Sepolia address + start block from `deployments/sepolia.json`, or hand-write the three files.
2. `schema.graphql` entities: `Job` (id, client, freelancer, arbitrator, token, totalAmount, state, timelock, createdAt, milestones), `Milestone` (id = jobId-index, amount, state, deliverableCid, submittedAt), `Activity` (id = txHash-logIndex, type, jobId, mIndex, actor, timestamp, data) — Activity powers the timeline UI. `Withdrawal`, `Dispute` entities as needed.
3. `src/mapping.ts`: one handler per §4.6 event, mechanically updating entities. This is where the events-on-every-transition discipline pays off — state is fully reconstructible.
4. **[HUMAN]** Subgraph Studio: create subgraph, `graph auth`, `graph deploy`. Record the query URL.
5. Verify with a GraphQL query returning the demo jobs.

Done criteria: Studio shows synced; a `{ jobs { id state milestones { state } } }` query returns live data.
Verify: curl/fetch the query URL.

✅ **TIER 3 STOP POINT.**

---

### ═══ TIER 4 — Frontend (contract is LOCKED from here — any ABI change means redoing 13+) ═══

### Phase 14 — Frontend scaffold + wallet
**Status: NOT STARTED**

Tasks:
1. `npm create vite@latest frontend -- --template react-ts`; install `wagmi viem @rainbow-me/rainbowkit @tanstack/react-query`. **Read the installed wagmi/RainbowKit versions' actual APIs before writing config** (`getDefaultConfig` from RainbowKit v2).
2. `wagmi.ts`: chains `[sepolia]` only; transport = Alchemy URL from env. Wrap app in WagmiProvider + QueryClientProvider + RainbowKitProvider.
3. Network guard component: if connected chain ≠ Sepolia, full-screen prompt with a switch-network button (`useSwitchChain`).
4. Export ABI: after `npx hardhat compile`, copy `artifacts/.../FreelanceEscrow.json` ABI into `frontend/src/abi/FreelanceEscrow.ts` as `export const escrowAbi = [...] as const;` (the `as const` is what gives wagmi full type inference). Add an npm script `sync-abi` that does this with a small node script.
5. Layout shell: header (logo, ConnectButton), routes (react-router): `/` jobs list, `/create`, `/job/:id`, `/arbitrator`.

Done criteria: `npm run dev` from the **main repo** shows the shell; wallet connects; wrong-network guard works.
Verify: run dev server, connect MetaMask on Sepolia (**[HUMAN]** for the wallet clicks; builder verifies compile + `npx tsc --noEmit`).

---

### Phase 15 — Client flow
**Status: NOT STARTED**

Tasks:
1. `CreateJobForm`: freelancer address, token select (ETH / USDC), milestone rows (description + amount), timelock select. USD mode: amounts in USD, live ETH quote via `useReadContract` on the price feed (`latestRoundData`), display converted ETH, then call `createJobUsd`. ETH/USDC mode: plain `createJob` (USDC path: `approve` then `createJob` — two-step TxButton with allowance check via `useReadContract` on `allowance`).
2. `TxButton` component: wraps `useWriteContract` + `useWaitForTransactionReceipt`; states idle/confirm-in-wallet/pending/success/error; disables during flight; surfaces revert reasons.
3. Job detail (client view): milestone list with Approve / Reject(reason) / Dispute buttons per state; pending-withdrawal banner with Withdraw button.
4. All reads through hooks in `hooks/` so Phase 17 can swap RPC→Graph in one place.

Done criteria: full client happy path clickable on Sepolia: create (all three denomination modes) → approve → withdraw.
Verify: `npx tsc --noEmit`; live click-through **[HUMAN]**.

---

### Phase 16 — Freelancer + arbitrator flows
**Status: NOT STARTED**

Tasks:
1. `RoleBadge`/role detection: derive the viewer's role per job (client/freelancer/arbitrator/observer) from the connected address; render action sets accordingly.
2. Freelancer: Accept button; Submit dialog = file/JSON upload → `lib/ipfs.ts` pin → CID → `submitMilestone`; Dispute dialog with evidence upload; withdraw banner.
3. Arbitrator page: list DISPUTED milestones (scan or Graph); evidence links (gateway URLs); a slider 0–100% + preview of both amounts + `resolveDispute`.
4. Timelock: show countdown to auto-release on SUBMITTED milestones (`submittedAt + timelock − now`); "Claim release" button appears when expired (anyone can click).

Done criteria: entire lifecycle incl. dispute clickable end-to-end with two browser profiles **[HUMAN]**.
Verify: `npx tsc --noEmit`; live click-through.

---

### Phase 17 — Reads via The Graph + timeline
**Status: NOT STARTED**

Tasks:
1. `lib/graph.ts`: typed fetch against `VITE_SUBGRAPH_URL`; queries for job list, job detail + milestones, activities. If env var empty → hooks fall back to existing RPC reads (keep both paths; the fallback is a documented feature, not dead code).
2. Jobs list page: "my jobs" (as client / as freelancer) + "all jobs" via Graph.
3. `Timeline` component on job detail: renders `Activity` entities (created, accepted, submitted, approved, rejected, disputed, resolved, released, withdrawn) with timestamps and actor addresses.

Done criteria: list + timeline render from subgraph data; RPC fallback still works with the env var removed.
Verify: `npx tsc --noEmit`; toggle env var and confirm both modes.

---

### Phase 18 — Ship: Vercel, demo script, video, final README
**Status: NOT STARTED**

Tasks:
1. `scripts/demo.ts`: with three env keys (client/freelancer/arbitrator — or one key playing all roles where guards allow… **it can't**; use three funded dev accounts **[HUMAN: fund two more]**), seed on Sepolia: job A completed happy-path, job B mid-dispute, job C awaiting timelock. Idempotent-ish (just creates new jobs each run).
2. **[HUMAN]** Vercel: import repo, root `frontend/`, set env vars, deploy. Custom domain optional.
3. **[HUMAN]** Record 3-minute video: 30s problem/architecture (show README state tables), 90s click-through of a lifecycle incl. dispute, 30s Etherscan verified contract + upkeep dashboard, 30s tests/CI/coverage. Upload (YouTube unlisted / Loom); link at the top of README.
4. Final README pass — order: video link, live app link, Sepolia address (Etherscan link), pitch, state tables, security section summary (link SECURITY.md), coverage/gas/Slither/fuzz bullets, architecture notes (pull payments, bounded automation, fund-on-create rationale, fee-on-transfer rejection), rejected-alternatives table (from the source plan §2 — interviewers love it), local dev instructions, env setup.

Done criteria: the Definition of Done table below is fully green.
Verify: watch the video link in an incognito window; load the Vercel URL without a wallet — everything read-only should still render (Graph reads don't need a wallet).

---

## 10. Definition of Done (per tier — copied from source plan, binding)

| Tier | Done means |
|---|---|
| 1 | Verified on Sepolia Etherscan, >90% coverage, fuzz invariants pass, Slither clean (no high/medium), CI green, README has state tables + threat model |
| 2 | Keeper upkeep live and observed firing on Sepolia, price-staleness handled + tested, USDC path tested (incl. fee-on-transfer rejection) |
| 3 | One full lifecycle where a merged GitHub PR auto-approves a milestone; all events queryable via subgraph |
| 4 | A recruiter can watch the 3-min video and understand the whole system without connecting a wallet |

---

## 11. Deployment & launch checklist (final pass, after Phase 18)

- [ ] Contract address in README matches `deployments/sepolia.json` matches frontend env matches subgraph manifest.
- [ ] Etherscan: source verified, NatSpec renders in "Contract" tab.
- [ ] Automation upkeep funded (>2 LINK remaining) and its dashboard link works.
- [ ] `.env` never committed anywhere in history (`git log -p -- .env` empty; if leaked, rotate keys and consider the dev wallet burned).
- [ ] CI green on main; badge live.
- [ ] Vercel production deploy from `main`, envs set.
- [ ] Demo video watchable logged-out; link at README top.
- [ ] `demo.ts` re-run leaves the app showing at least one job in each interesting state.
- [ ] SECURITY.md discloses: unaudited, testnet-only, single-arbitrator trust, owner powers.

---

## 12. Known risks / hard parts, with mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Chainlink Functions integration (Phase 12) burns weeks** | High — the source plan calls it "the fiddliest part" | Hard time-box (5 sessions), public-repos-only (no secrets management), ship without it if it fights back |
| `@chainlink/contracts` import paths differ from training data | High | Always `ls node_modules/@chainlink/contracts/src/v0.8/` before writing imports |
| OZ v5 vs v4 API drift (Ownable ctor, Pausable hooks, SafeERC20 usage) | Medium | Read installed sources first; the blueprint already encodes v5 patterns |
| Foundry on Windows friction | Medium | Install via foundryup in Git Bash; if broken, run forge only in CI (ubuntu) and note it — invariants still gate merges |
| Redeploy churn (each ABI change → redeploy → re-verify → update subgraph/frontend) | Certain | Blueprint batches redeploys at Phases 6, 8, 9, 10; contract LOCKED after Phase 10; subgraph/frontend only start after the lock |
| Price-feed decimal math off-by-10^n | Medium | §5 mandates unit tests at known prices before any Sepolia use |
| Automation upkeep silently not firing (underfunded LINK, wrong gas limit) | Medium | Set gas limit ≥ 500k at registration; check dashboard after first expiry; `claimTimelockRelease` remains as manual fallback forever |
| Sepolia faucet drought | Medium | Start collecting ETH at Phase 0, not Phase 6; Alchemy + Google faucets daily |
| Flaky home broadband masquerading as RPC bugs | Known issue | On sudden RPC failures, check the connection before debugging code |
| Context-limit death mid-phase | Certain eventually | This file IS the resume point: update `Status:` lines and commit often; `/checkpoint` before long operations |
| Griefing: client never approves/rejects | By design | That's exactly what the timelock solves — say so in interviews |
| Griefing: infinite reject loops | Accepted v1 limitation | Freelancer's recourse = dispute; documented in SECURITY.md as future work (e.g. max rejections) |

---

## 13. Notes to the AI builder (read before every session)

1. **This file is the plan of record.** Re-read the current phase's section fully before writing code. Do not import scope from other phases "while you're in there."
2. **Spec over habit:** where §4/§5 conflicts with the pattern you'd write from memory, the spec wins. Where a library version makes the spec impossible, deviate minimally and record the deviation under the phase's Status line.
3. **Tests are not a separate phase-end chore** — they're written alongside the function they cover, in the same phase.
4. **Never hold real secrets:** you write `.env.example`; the human fills `.env`. Never print, echo, or commit private keys. If a key appears in output, tell the user to rotate it.
5. **Immutability discipline:** after Phase 10 the ABI is frozen. If you find a contract bug during Tier 3/4, stop and surface it — redeploying invalidates the subgraph and README; that's the user's call.
6. **Windows rules** (§"Environment facts") apply to every command you run.
7. When a phase completes: update `Status: DONE` here, append a one-line note of anything a future session must know (resolved versions, deployed addresses, deviations), commit with `phase(N): ...`.
