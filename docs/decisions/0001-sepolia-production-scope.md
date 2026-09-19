# ADR 0001 — Sepolia Production Scope and ABI Freeze

- **Status:** Accepted
- **Date:** 2026-09-18
- **Target release:** Public Sepolia testnet website
- **Decision owners:** Project owner and production-launch implementation

## Context

The contract, subgraph source, and Holdfast frontend already exist, and the current contract is deployed and verified on Sepolia. Several open product decisions could still force another contract deployment or create misleading UI behavior:

- The creation form collects milestone titles, but the contract stores only ordered amounts.
- Chainlink Functions PR auto-approval was planned but never implemented.
- The contract can accept arbitrary ERC-20 addresses even though only USDC has a supported product experience.
- Arbitration and owner-key expectations need to be explicit.
- Chainlink Automation scans a bounded prefix of active submissions, which is appropriate for a demo but has a scale-related liveness limitation.

The immediate goal is a production-quality **testnet** application, not a mainnet or real-money release.

## Decisions

### 1. Freeze the deployed contract and ABI

The Sepolia release will use the verified deployment at `0x85DBE339432cd7960FADFef78e2E6981025bD4BA`. No further contract or ABI change is in scope for this release.

Any future contract feature requires a new version, deployment record, verification, ABI synchronization, subgraph migration, frontend configuration update, and security review.

### 2. Use numbered milestones for the launch release

Milestone titles/descriptions are not durably bound to a job by the current contract. The launch UI will therefore stop collecting titles that are silently discarded and will present milestones as `Milestone 1`, `Milestone 2`, and so on, with their on-chain amounts and state.

Rich job specifications remain external agreements between the parties. A future contract version may add a job-level metadata CID after its privacy, durability, and indexing model is designed.

### 3. Defer Chainlink Functions PR auto-approval to v2

GitHub PR auto-approval is not required for the core escrow lifecycle or the public Sepolia launch. Implementing it now would expand the contract surface and require another deployment after the ABI was already integrated.

Phase 12 in `BLUEPRINT.md` is retained as a v2 design reference, but it is not part of the launch Definition of Done.

### 4. Support ETH and official Sepolia USDC in the product UI

The frontend will expose only:

- Native Sepolia ETH (`address(0)`).
- Circle Sepolia USDC at `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.

The contract remains permissionless and can technically receive another ERC-20 address through direct calls. The website does not endorse or guarantee arbitrary tokens. In particular, an exact initial balance delta rejects many fee-on-transfer tokens but does not make rebasing or malicious tokens safe over the full job lifetime.

### 5. Retain per-job arbitration

The client supplies a neutral arbitrator when creating a job. That address is snapshotted into the job and cannot be changed later. Passing the zero address opts into the protocol default arbitrator.

For the Sepolia portfolio release, EOA ownership and arbitration are accepted with prominent testnet/unaudited disclosure. A real-money deployment requires multisig or other independently reviewed administration and arbitration arrangements.

### 6. Accept bounded Automation for low-volume Sepolia use

The existing `checkUpkeep` implementation scans at most the first 100 active submitted milestones and returns at most 10 releases. At higher volume, an expired entry outside that prefix may be delayed behind earlier non-expired entries.

For the low-volume Sepolia release:

- This limitation is accepted and documented.
- Manual `claimTimelockRelease` remains visible as the authoritative fallback.
- The upkeep must still be registered, funded, and observed firing before launch.

Before mainnet or meaningful scale, use a rotating/ranged keeper strategy or a revised audited contract.

## Consequences

### Positive

- The deployed contract address and ABI remain stable.
- Subgraph and frontend work can proceed without another migration.
- The UI no longer implies that discarded milestone descriptions are stored.
- The supported-token and Automation claims become accurate and testable.
- Chainlink Functions cannot delay the core product launch.

### Trade-offs

- Milestones have no durable on-chain human-readable title in this release.
- GitHub PR completion cannot automatically approve a milestone.
- Users calling the contract directly can choose tokens the website does not support.
- Automation is not guaranteed to find every expired milestone promptly at high active-submission counts.
- Each job still trusts one selected arbitrator for disputed funds.

## Follow-up work

- Remove milestone-title inputs from the launch creation form.
- Replace browser-side Pinata credentials with a server-side upload service.
- Keep manual timelock release prominent in the job UI.
- Update token, Automation, and arbitration disclosures across README, security documentation, and the application.
- Track Chainlink Functions and rich job metadata as post-launch contract-version features.
