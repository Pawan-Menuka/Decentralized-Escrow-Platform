# Production Launch Plan

> **Target:** Ship a production-quality, publicly accessible **Sepolia testnet** website for the Decentralized Freelance Escrow Platform.
>
> **Important:** This plan does not authorize a real-money mainnet launch. The current contract is unaudited and explicitly testnet-only. Mainnet preparation is a separate track at the end of this document.

## How to use this plan

1. Complete phases in order. Do not start the next phase while required checks in the current phase are failing.
2. Change each phase's `Status` from `NOT STARTED` to `IN PROGRESS`, then to `DONE` only after all exit criteria pass.
3. Keep `BLUEPRINT.md` as the protocol history and plan of record. This file is the detailed launch plan for the remaining product work.
4. Use the deployed Sepolia contract unless Phase 1 concludes that a contract change is essential.
5. Every contract redeployment must update the deployment record, README, frontend environment, ABI, and subgraph manifest together.
6. Never commit secrets. Browser variables prefixed with `VITE_` must be treated as public.
7. Human-only work is marked **[HUMAN]**.

## Definition of the target release

The Sepolia release is complete when a visitor can:

- Open the production URL without a wallet and browse indexed jobs.
- Connect a wallet and receive a clear prompt if it is on the wrong network.
- Create and fund an ETH, USD-denominated ETH, or approved Sepolia USDC job.
- Accept work, submit IPFS-hosted deliverables, approve/reject work, raise and resolve disputes, claim expired milestones, and withdraw ETH or USDC.
- See accurate job state, milestone state, balances, deadlines, activity, transaction status, and Etherscan links.
- Use an RPC fallback when the subgraph is unavailable.
- Understand that the product is testnet-only, unaudited, uses a trusted arbitrator, and has owner-controlled fees capped at 5%.

The release must also have a green production build, automated CI checks, a deployed and synced subgraph, secure IPFS uploads, monitored live infrastructure, and a documented operational runbook.

---

## Phase 0 — Baseline, branches, and reproducible verification

**Status: DONE** — Baseline established on `Develop` at commit `2eabe2ae97d1b4bd1f34a91fee00e18ac1b3c1bf`. Fresh local verification: 143 Hardhat tests pass; coverage is 98.98% statements / 93.06% branches / 100% functions / 100% lines; root TypeScript passes; frontend production build passes; subgraph codegen + build pass; generated ABIs match the compiled contract. The matching GitHub Actions run is green for Hardhat, frontend, Foundry, and Slither. `docs/PRODUCTION_BASELINE.md` records the Sepolia configuration and known dependency/bundle/security debt. The untracked design handoff is preserved as a read-only reference; tracked production work remains in `frontend/`.

### Goal

Establish a clean, reproducible baseline before product work begins.

### Tasks

- Confirm whether launch work targets `Develop` or `main`; update `CLAUDE.md` if the documented workflow is no longer correct.
- Decide how to preserve the untracked `Frontend Design Project/handoff` directory:
  - Keep it as a read-only design reference, or
  - Move it under a documented design/archive directory.
- Do not build directly inside the untracked handoff directory.
- Install root dependencies using the repository rule:

  ```bash
  npm ci --legacy-peer-deps
  ```

- Independently rerun the existing checks instead of relying on README-reported results:

  ```bash
  npx hardhat compile
  npx hardhat test
  npx hardhat coverage
  npx tsc --noEmit
  ```

- Run Foundry and Slither through CI if the local Windows environment cannot run them.
- Install subgraph dependencies and verify its current build:

  ```bash
  cd subgraph
  npm ci --legacy-peer-deps
  npm run codegen
  npm run build
  ```

- Record the currently verified contract address, deployment block, chain ID, Sepolia USDC address, ETH/USD feed, owner, and arbitrator in a single configuration table.
- Confirm `.env` and frontend environment files have never been tracked. If any secret was committed, rotate it before continuing.

### Exit criteria

- The contract test/coverage baseline is freshly verified.
- Subgraph codegen and build pass.
- The branch strategy is documented and unambiguous.
- The design handoff is preserved without being mistaken for production code.
- The working tree contains no unexplained changes.

---

## Phase 1 — Freeze launch scope and resolve product decisions

**Status: DONE** — Launch scope is frozen in `docs/decisions/0001-sepolia-production-scope.md`: keep the deployed ABI; use numbered milestones rather than discarding titles; defer Chainlink Functions to v2; expose only ETH and official Sepolia USDC in the UI; retain per-job snapshotted arbitrators; and accept bounded Automation for low-volume Sepolia with manual release as the visible fallback. README, `SECURITY.md`, and `BLUEPRINT.md` now reflect these decisions. No contract change or redeployment is required.

### Goal

Resolve decisions that would otherwise force contract, indexer, or frontend rework.

### Required decisions

#### 1. Milestone metadata

The current contract stores milestone amounts but not titles or descriptions. Choose one launch model:

- **Recommended for this release:** create a job-level metadata document on IPFS containing milestone titles/descriptions, then maintain a reliable job-to-CID association outside the immutable contract with transparent fallback behavior.
- Remove titles/descriptions and present milestones by index only.
- Change the contract to store a metadata CID, accepting a new deployment and all downstream updates.

Do not leave the existing UI behavior where titles are collected and silently discarded.

#### 2. Chainlink Functions

- **Recommended:** explicitly defer GitHub PR auto-approval to v2.
- If it is required for launch, implement it now and accept that the contract must be redeployed and reverified before any frontend/subgraph work continues.

#### 3. Supported tokens

- Restrict the production UI to native ETH and an explicitly configured Sepolia USDC contract.
- Do not imply that arbitrary ERC-20 or rebasing tokens are safe.
- Decide how token name, symbol, decimals, and explorer links are sourced and validated.

#### 4. Arbitrator model

- Confirm the launch arbitrator address.
- Decide whether ownership and arbitration should remain on the current EOA for the portfolio release or move to a multisig.
- Make the global/snapshotted arbitrator behavior clear in the UI. Users do not select a per-job arbitrator in the current contract.

#### 5. Automation scalability

The current upkeep scan checks only the first 100 active submissions. Choose one:

- Accept it for a low-volume Sepolia demo, disclose it, and keep manual claim prominent.
- Add an off-chain keeper strategy that checks ranges/candidates and calls the already-validating contract.
- Modify and redeploy the contract with a rotating cursor/ranged scan.

### Deliverables

- Add an Architecture Decision Record under `docs/decisions/` covering all five decisions.
- Update `BLUEPRINT.md` and README so Chainlink Functions is either in scope or explicitly deferred.
- If the contract changes, redeploy, verify, regenerate ABI, update `deployments/sepolia.json`, and restart Phase 0 verification.

### Exit criteria

- No unresolved product decision can force a later ABI redesign.
- The frontend data model is agreed upon.
- The launch token and arbitrator policies are explicit.

---

## Phase 2 — Correct and harden the subgraph

**Status: NOT STARTED**

### Goal

Make indexed data accurate enough to power the production read experience.

### Tasks

- Fix multi-dispute state handling. Resolving one of several disputes must not mark a job `IN_PROGRESS` while another dispute remains open.
- Add the snapshotted arbitrator to the `Job` entity. Read it from the contract during `JobCreated` handling if the event does not contain it.
- Add or derive fields needed by the frontend, including approved milestone count and useful timestamps where reliable.
- Preserve correct behavior when a contract view call reverts during indexing; do not present zero-value placeholder milestones as verified amounts without a visible data-quality signal.
- Populate activity actors using event fields or transaction sender where meaningful.
- Clear `deliverableCid` and `submittedAt` when a milestone is rejected, mirroring contract state.
- Define account/token withdrawals as account-level activity. Do not falsely associate a pooled withdrawal with one job.
- Fix the manifest repository URL.
- Replace `latest` dependency ranges with the known working versions already represented by the lockfile.
- Replace `<SUBGRAPH_SLUG>` with a configurable, documented deploy command.
- Add Matchstick unit tests, or equivalent deterministic mapping tests, for:
  - Job creation and milestone hydration.
  - Submission, rejection, and resubmission.
  - Approval and auto-release.
  - One dispute.
  - Multiple simultaneous disputes resolved in different orders.
  - Completed and cancelled jobs.
  - USD job enrichment.

### Verification

```bash
cd subgraph
npm ci --legacy-peer-deps
npm run codegen
npm test
npm run build
```

### Exit criteria

- Mapping tests cover all lifecycle transitions.
- Multi-dispute jobs remain accurate.
- Arbitrator jobs can be queried directly.
- Subgraph codegen and build pass from a clean install.

---

## Phase 3 — Scaffold the tracked production frontend

**Status: NOT STARTED**

### Goal

Create the real `/frontend` application and port only reusable presentation work from the handoff.

### Tasks

- Scaffold Vite + React + TypeScript under `frontend/`.
- Install pinned compatible versions of React, Vite, wagmi, viem, RainbowKit, TanStack Query, and React Router.
- Commit `frontend/package-lock.json`.
- Add scripts for `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, and `test:e2e`.
- Port visual components and styles from the handoff without copying its placeholder contract integration.
- Implement provider order:
  - Wagmi provider.
  - TanStack Query provider.
  - RainbowKit provider.
  - Router.
- Configure Sepolia as the only supported launch chain.
- Add a full wrong-network guard with a switch-network action.
- Make the shell and public read pages usable without a connected wallet.
- Validate all required public environment variables at startup and show a configuration error rather than crashing silently.
- Create initial routes:
  - `/`
  - `/jobs`
  - `/jobs/:jobId`
  - `/create`
  - `/arbitrator`
  - `/about/security`

### Required environment template

```dotenv
VITE_CHAIN_ID=11155111
VITE_ESCROW_ADDRESS=
VITE_USDC_ADDRESS=
VITE_WALLETCONNECT_PROJECT_ID=
VITE_SEPOLIA_RPC_URL=
VITE_SUBGRAPH_URL=
VITE_IPFS_GATEWAY_URL=
```

Do not add `VITE_PINATA_JWT`.

### Exit criteria

- `frontend/` is tracked and builds from a clean install.
- The production shell matches the approved design direction.
- Public routes render without a wallet.
- Wallet connection and network switching work.
- No placeholder ABI or fake production data remains.

---

## Phase 4 — ABI, configuration, and read architecture

**Status: NOT STARTED**

### Goal

Create a type-safe, consistent boundary between contract, subgraph, and UI.

### Tasks

- Add a root `sync-abi` script that extracts the ABI from the Hardhat artifact and generates `frontend/src/abi/FreelanceEscrow.ts` with `as const` typing.
- Add a CI check that fails if the generated frontend ABI differs from the compiled contract artifact.
- Centralize chain addresses and verify that the contract address matches:
  - `deployments/sepolia.json`
  - `subgraph/subgraph.yaml`
  - Frontend environment configuration
  - README
- Implement typed domain adapters for `Job`, `Milestone`, token balances, roles, and state labels. Do not let raw ABI tuples leak throughout page components.
- Build a read-service interface with two implementations:
  - The Graph for lists, timelines, and indexed discovery.
  - Direct RPC for authoritative current contract state and fallback.
- Prefer direct contract reads for transaction-critical state immediately before showing/enabling an action.
- Implement query retries, explicit loading/empty/error states, stale-data indicators, and manual refresh.
- Implement role detection from actual job fields.
- Handle job IDs correctly: the contract uses `jobCounter` and IDs start at 1.
- Implement token-aware pending withdrawals using both token and account.

### Exit criteria

- ABI and address drift are automatically detected.
- Job list/detail pages render real Sepolia data.
- Removing `VITE_SUBGRAPH_URL` activates the RPC fallback.
- Multi-token withdrawals are represented separately and accurately.

---

## Phase 5 — Secure IPFS upload service

**Status: NOT STARTED**

### Goal

Support deliverable and dispute-evidence uploads without exposing Pinata credentials.

### Tasks

- Implement a server-side upload endpoint, such as a Vercel Function under `/api/ipfs`.
- Store `PINATA_JWT` only in the server environment.
- Require a recent wallet-signed challenge for uploads, or implement another documented anti-abuse control.
- Apply:
  - File-size limits.
  - MIME allowlist/blocklist.
  - Filename sanitization.
  - Request rate limits.
  - Per-wallet quotas suitable for the demo.
  - Timeouts and safe error messages.
- Pin structured JSON manifests that include content CID, original filename, MIME type, size, submitting wallet, job ID, milestone index, and timestamp.
- Never claim that uploaded content is private. IPFS content should be treated as public.
- Render unknown IPFS content safely; never inject returned HTML into the application.
- Make the gateway configurable and support at least one fallback gateway.
- Add endpoint and frontend tests for successful upload, unauthorized upload, oversized file, invalid type, Pinata failure, and timeout.
- **[HUMAN]** Create/rotate a scoped Pinata token and configure it in the deployment environment.

### Exit criteria

- No Pinata credential appears in frontend source, bundles, logs, or browser network headers.
- A real file can be uploaded and resolved through the configured gateway.
- Abuse and failure paths return safe, understandable errors.

---

## Phase 6 — Client flows

**Status: NOT STARTED**

### Goal

Complete every action available to a client.

### Tasks

- Implement the creation form with:
  - Freelancer address validation.
  - ETH, USD-denominated ETH, and Sepolia USDC modes.
  - Milestone count and amount validation.
  - Timelock boundaries read from or aligned with the contract.
  - Fee and funding summary.
  - Clear explanation of the global snapshotted arbitrator.
- For USD-denominated ETH:
  - Read the Chainlink quote.
  - Show quote timestamp and potential staleness.
  - Recalculate before submission.
  - Call `createJobUsd` with the exact required value.
- For USDC:
  - Read decimals and allowance.
  - Use exact integer parsing; never use floating-point arithmetic for transaction values.
  - Implement approve-then-create as an explicit two-transaction state machine.
  - Support retrying either step safely.
- Implement client job actions:
  - Cancel before acceptance.
  - Approve a submitted milestone.
  - Reject with a reason.
  - Raise a dispute with uploaded evidence.
  - Withdraw ETH and USDC balances.
- Simulate transactions before wallet confirmation when supported.
- Decode known custom errors into plain-language messages.
- Show wallet-confirmation, pending, confirmed, replaced, rejected, reverted, and retry states.

### Exit criteria

- A client can complete each flow on a local chain and Sepolia.
- Amounts are exact and token-aware.
- Failed or rejected transactions never leave the UI in a false-success state.

---

## Phase 7 — Freelancer, arbitrator, and public flows

**Status: NOT STARTED**

### Goal

Complete all non-client roles and the public read experience.

### Tasks

- Freelancer:
  - View assigned funded jobs.
  - Accept a job.
  - Upload and submit a deliverable CID.
  - Resubmit after rejection.
  - Raise a dispute with evidence.
  - Withdraw ETH and USDC.
- Arbitrator:
  - List jobs snapshotted to the connected arbitrator.
  - Filter unresolved disputes.
  - Open deliverable and evidence links safely.
  - Choose a split from 0–100% with exact basis-point preview.
  - Preview freelancer amount, client amount, and protocol fee.
  - Resolve a dispute.
- Public/observer:
  - Browse all indexed jobs without connecting a wallet.
  - View job and milestone state.
  - View the event timeline.
  - Open contract, account, transaction, and token links on Etherscan.
- Timelocks:
  - Show an accurate countdown based on chain timestamps.
  - Expose manual `claimTimelockRelease` when eligible.
  - Explain that manual claim remains available if Automation is delayed.
- Handle multiple simultaneous disputes correctly in every role view.

### Exit criteria

- Complete happy path, rejection/resubmission, dispute, cancellation, and timelock lifecycles work end to end.
- All role/action visibility is derived from contract state and connected address.
- Read-only pages work when disconnected.

---

## Phase 8 — Frontend quality, accessibility, and security hardening

**Status: NOT STARTED**

### Goal

Make the application resilient and safe enough for a public deployment.

### Tasks

- Add unit/component tests for adapters, amount parsing, role logic, countdowns, state labels, and transaction state machines.
- Add end-to-end tests against a deterministic local Hardhat node using separate client, freelancer, arbitrator, and observer wallets.
- Test:
  - Wallet disconnected/reconnected.
  - Wrong network.
  - User rejects a signature.
  - Transaction replacement and revert.
  - RPC unavailable.
  - Subgraph unavailable or stale.
  - IPFS gateway unavailable.
  - Empty job set and large job set.
  - Multiple simultaneous disputes.
  - ETH and USDC withdrawals existing together.
- Run an accessibility pass:
  - Keyboard navigation.
  - Focus management for dialogs.
  - Labels and error association.
  - Color contrast.
  - Reduced motion.
  - Screen-reader transaction updates.
- Verify layouts on common phone, tablet, laptop, and wide-desktop sizes.
- Add safe external-link handling and content security policy.
- Add security headers: CSP, HSTS after HTTPS validation, `X-Content-Type-Options`, `Referrer-Policy`, and an appropriate `Permissions-Policy`.
- Avoid logging wallet signatures, secrets, uploaded content, or sensitive RPC payloads.
- Add a visible testnet/unaudited banner and security/trust explanation.

### Verification

```bash
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

### Exit criteria

- All automated checks pass.
- No critical accessibility failures remain.
- The production bundle contains no secrets.
- The application degrades safely when external services fail.

---

## Phase 9 — CI/CD and dependency governance

**Status: NOT STARTED**

### Goal

Prevent broken or unsafe changes from reaching production.

### Tasks

- Extend GitHub Actions with separate required jobs for:
  - Root TypeScript and Hardhat compile/tests/coverage.
  - Foundry invariants.
  - Slither.
  - Subgraph codegen/tests/build.
  - Frontend typecheck/lint/tests/build.
  - End-to-end tests.
  - ABI/address consistency.
  - Secret scanning.
  - Dependency review for pull requests.
- Cache dependencies without bypassing lockfiles.
- Pin GitHub Actions to trusted versions or immutable commit SHAs where appropriate.
- Enable Dependabot or Renovate with grouped, reviewable updates.
- Add a production deploy workflow gated on all checks and the intended branch.
- Ensure preview deployments do not receive production Pinata credentials unless explicitly protected.
- Add branch protection and require successful checks before merge.
- **[HUMAN]** Configure repository environments and protected production secrets.

### Exit criteria

- A broken frontend, subgraph, ABI, or contract test blocks merging/deployment.
- Production deploys are reproducible from the selected branch.
- Secrets are scoped to the production environment.

---

## Phase 10 — Live Sepolia infrastructure validation

**Status: NOT STARTED**

### Goal

Prove every external integration works in the real target environment.

### Tasks

- **[HUMAN]** Create the Subgraph Studio project and deploy the corrected subgraph.
- Wait for full sync from the deployment block and validate representative GraphQL queries.
- **[HUMAN]** Register the Chainlink Automation upkeep with a suitable gas limit and LINK balance.
- Record the upkeep ID and dashboard URL.
- Observe at least one real automated release transaction.
- Validate the manual release fallback separately.
- **[HUMAN]** Obtain Sepolia USDC and complete approve/create/submit/approve/withdraw.
- Complete a live USD-denominated ETH job.
- Complete a live IPFS deliverable and dispute-evidence upload.
- Exercise concurrent disputes and confirm subgraph state remains accurate.
- Verify the deployed contract source, constructor parameters, owner, arbitrator, feed, and fee on Etherscan.
- Confirm Alchemy/RPC application restrictions, quotas, and alerting.
- Fund required test accounts without using any real-value wallet keys.

### Exit criteria

- Every external dependency has a successful live test with recorded evidence.
- Automation has fired at least once.
- The subgraph is fully synced and accurate.
- ETH, USD-ETH, USDC, IPFS, dispute, and withdrawal flows have been exercised on Sepolia.

---

## Phase 11 — Production deployment and observability

**Status: NOT STARTED**

### Goal

Deploy the public site with safe configuration and enough visibility to operate it.

### Tasks

- Create a Vercel project with `frontend/` as the application root, plus the IPFS serverless function configuration.
- Configure production environment variables and verify none are exposed unintentionally.
- Add a custom domain if desired.
- Add privacy-conscious error monitoring for frontend and serverless failures.
- Add uptime checks for:
  - Public site.
  - IPFS upload endpoint health.
  - Subgraph query endpoint.
  - Configured RPC endpoint.
- Add alerts for repeated upload failures, subgraph lag, RPC errors, and depleted upkeep funding.
- Create `docs/OPERATIONS.md` covering:
  - Environment inventory.
  - Deployment procedure.
  - Rollback procedure.
  - Secret rotation.
  - Pinata outage response.
  - RPC/subgraph outage response.
  - Upkeep funding checks.
  - Incident communication.
- Verify the deployed site on a clean browser with no wallet extension.
- Verify with at least two wallet/browser profiles on mobile and desktop.

### Exit criteria

- The production URL is stable and HTTPS-only.
- Read-only use works without a wallet.
- Monitoring and an operational runbook exist.
- A previous known-good frontend deployment can be restored quickly.

---

## Phase 12 — Release candidate, documentation, and public launch

**Status: NOT STARTED**

### Goal

Perform the final release audit and present the project honestly.

### Tasks

- Update `SECURITY.md` to reflect completed ERC-20 support and remove stale ETH-only/future-tense claims.
- Document the supported-token policy and rebasing-token limitation accurately.
- Update README with, in this order:
  - Live website.
  - Demo video.
  - Testnet/unaudited warning.
  - Verified contract address.
  - Product pitch and lifecycle.
  - Supported assets.
  - Trust assumptions and owner powers.
  - Tests, coverage, invariants, and static analysis.
  - Architecture and external dependencies.
  - Local setup and deployment instructions.
- Add user-facing Terms/Disclaimer and Privacy information appropriate for a testnet demo.
- Seed representative jobs:
  - Completed ETH job.
  - Completed USDC job.
  - Submitted job awaiting action.
  - Disputed job.
  - Auto-released job.
- Run a release-candidate checklist from a fresh clone.
- **[HUMAN]** Record a short demo showing client, freelancer, arbitrator, Etherscan, tests, and the testnet disclaimer.
- **[HUMAN]** Validate every public link in a logged-out/incognito browser.
- Tag the release and record the deployed frontend commit SHA.

### Final launch checklist

- [ ] Contract address matches deployment record, frontend, subgraph, and README.
- [ ] Generated ABI matches the verified contract.
- [ ] Subgraph is synced and returns accurate multi-dispute state.
- [ ] Automation is funded and has fired successfully.
- [ ] Pinata JWT is server-side only.
- [ ] Production site works without a wallet.
- [ ] ETH, USD-ETH, and USDC flows pass on Sepolia.
- [ ] Client, freelancer, arbitrator, and observer flows pass.
- [ ] RPC and subgraph failure modes are usable.
- [ ] CI is green on the deployed commit.
- [ ] No secret exists in git history or the production browser bundle.
- [ ] Security documentation is current.
- [ ] Testnet-only and unaudited warnings are visible.
- [ ] Demo video and explorer links work while logged out.

### Exit criteria

- Every checklist item is complete.
- The release tag maps to the deployed production build.
- The Sepolia production website can be publicly shared.

---

## Phase 13 — Optional post-launch improvements

**Status: NOT STARTED**

These items should not block the initial Sepolia website unless scope changes:

- Chainlink Functions GitHub PR auto-approval.
- Multiple/federated arbitrators or decentralized arbitration.
- Per-job arbitrator selection in a new contract version.
- Rich on-chain job metadata.
- Notifications for submissions, disputes, and approaching deadlines.
- Additional supported stablecoins.
- Reputation and profiles.
- Improved decentralized IPFS pinning redundancy.
- Rotating/ranged Automation scanning in a new contract version.

Each contract-level improvement requires a new security review, deployment, ABI synchronization, and subgraph migration plan.

---

## Separate track — Mainnet readiness

**Status: OUT OF SCOPE FOR THE SEPOLIA RELEASE**

Do not treat completion of Phase 12 as approval for real-money use. Before mainnet:

- Commission an independent professional smart-contract audit and remediate all accepted findings.
- Expand invariant testing to cover every supported token and multi-job/multi-dispute accounting.
- Decide whether arbitrary ERC-20 creation must be restricted at contract level.
- Resolve the Automation scan-window liveness limitation in a new audited deployment.
- Move ownership and arbitration to documented multisig or governance arrangements.
- Create emergency, incident-response, and responsible-disclosure processes.
- Obtain legal advice covering escrow, arbitration, fees, sanctions, privacy, consumer protection, and applicable financial regulation.
- Establish production monitoring for contract events, balances, owner actions, fee changes, pause actions, oracle health, and keeper health.
- Perform load, RPC quota, subgraph scale, upload abuse, and disaster-recovery testing.
- Use a staged launch with explicit value caps and a bug bounty.
- Publish final audit reports, deployed bytecode verification, admin addresses, and trust assumptions.

Mainnet should have its own implementation plan and release approval process.

---

## Suggested execution order summary

| Order | Phase | Primary output |
|---:|---|---|
| 1 | Baseline | Fresh green verification and clean workflow |
| 2 | Scope decisions | Frozen ABI/data/product model |
| 3 | Subgraph | Correct, tested indexer |
| 4 | Frontend scaffold | Tracked production application |
| 5 | Data architecture | Generated ABI and Graph/RPC reads |
| 6 | Secure IPFS | Server-side pinning flow |
| 7 | Client flows | Complete client lifecycle |
| 8 | Other roles | Freelancer/arbitrator/public lifecycle |
| 9 | Hardening | Tests, accessibility, security |
| 10 | CI/CD | Required automated gates |
| 11 | Live integrations | Proven Sepolia infrastructure |
| 12 | Deployment | Public monitored website |
| 13 | Launch | Documentation, demo, release tag |
