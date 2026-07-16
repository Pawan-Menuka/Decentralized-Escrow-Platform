# Frontend Design Brief — Decentralized Freelance Escrow

> **Who this is for:** whoever designs the UI (you, a designer, or a design tool like v0/Figma). It captures **what** every screen must show and do — the data, actions, roles, and states the design has to accommodate. **The visual design is entirely yours**; this doc is the functional contract the design must satisfy so it wires up cleanly afterward.
>
> **How the build works:** you design the UI (as React components ideally — see stack below), hand it over, and it gets integrated with **no visual changes** — only the data/logic wiring described here (`/ui-drop` workflow).
>
> Everything below is derived from the **deployed, verified contract** and its **subgraph**. Nothing here is speculative.

---

## 1. What the product is

A milestone-based escrow for freelance work, live on the **Ethereum Sepolia testnet**. A client funds a job split into milestones; a freelancer accepts and submits work per milestone; the client approves (releasing funds) or disputes; an arbitrator resolves disputes by splitting the funds; and if the client goes silent, funds auto-release after a time-lock. Payments are in **ETH or an ERC-20 (USDC)**. A 1% protocol fee is skimmed on each release to the freelancer.

**The wallet is the identity** — there are no accounts, emails, or passwords. Everything is on-chain.

### The four actors (a "role" is derived per-job from the connected wallet)
| Role | How it's determined | Can do |
|---|---|---|
| **Client** | connected wallet == job's `client` | create + fund, approve/reject milestones, cancel (pre-acceptance), raise disputes, withdraw refunds |
| **Freelancer** | connected wallet == job's `freelancer` | accept job, submit/resubmit milestones, raise disputes, withdraw earnings |
| **Arbitrator** | connected wallet == job's `arbitrator` | resolve disputed milestones (choose the split) |
| **Observer** | any other address, or not connected | browse everything read-only; can trigger an expired time-lock release |

> The same **Job Detail** screen must render **different controls per role** for the same job. This is the single most important UX requirement.

---

## 2. Tech stack the design should target

| Concern | Choice |
|---|---|
| Build / framework | **Vite + React 18 + TypeScript** |
| Chain interaction | **wagmi v2 + viem v2** (hooks for reads/writes) |
| Wallet connect UI | **RainbowKit v2** — ships a themeable `ConnectButton` + wallet modal. You can theme it to match your design or trigger a custom-styled button that opens its modal. |
| Data fetching | **TanStack Query** (built into wagmi) |
| Routing | **react-router** |
| List/timeline reads | **The Graph subgraph** (GraphQL), with a direct-RPC fallback |
| File storage | **IPFS via Pinata** (deliverables, dispute evidence) |
| Hosting | **Vercel** |

**Design implications:**
- Deliver as **React components** (JSX + your CSS approach — Tailwind, CSS Modules, styled-components, plain CSS all fine). Static HTML/CSS mockups also work; they'll be ported to components preserving your exact markup/classes.
- The only pre-styled third-party element is RainbowKit's connect/wallet modal — everything else is yours.
- The app is a **client-side SPA** (no server, no SSR). All data comes from the chain, the subgraph, and IPFS.

---

## 3. Global UX rules (every design must handle these)

1. **Wallet connection states:** *not connected* (browsing/reads still work; any write action prompts connect) and *connected*. A persistent connect/account control lives in the header.
2. **Network guard — Sepolia only.** If the connected wallet is on any other network, block interaction with a clear "Wrong network → Switch to Sepolia" state (full-screen overlay or prominent banner + button). Design this state explicitly.
3. **Read vs. write:** browsing jobs, viewing a job, and reading the timeline all work **without a wallet** (served by the subgraph). Every **state-changing action** requires a connected wallet on Sepolia.
4. **Transaction lifecycle** — every write passes through: `idle → awaiting wallet confirmation → pending (mining) → success | error (with revert reason)`. Design **one consistent pattern** for this (button states + toast/inline feedback). Buttons must disable while a tx is in flight.
5. **Role-aware controls** (see §1) — actions shown depend on the viewer's role for that job **and** the current job/milestone state.
6. **Money display:** show amounts in their token (ETH or USDC). **USD-denominated jobs** additionally show the USD figure and a live ETH conversion (from the Chainlink price feed). Always surface the **1% fee** and the **net** the freelancer receives on releases.
7. **Every data view needs empty / loading / error states** — job lists, job detail, timelines, balances.

---

## 4. Domain vocabulary (the data the UI displays)

### Job
`id`, `client` (address), `freelancer` (address), `arbitrator` (address), `token` (address — `0x0` = ETH, else ERC-20/USDC), `totalAmount`, `milestoneCount`, `state`, `timelock` (seconds), `createdAt`. USD jobs also carry `usdTotal` and the `ethUsdPrice` used at funding.

**Job states:** `FUNDED` → `IN_PROGRESS` → `COMPLETED`, with side-paths to `DISPUTED` and `CANCELLED`.

### Milestone (each job has an ordered list, by `index`)
`amount`, `state`, `deliverableCid` (IPFS CID of submitted work, empty until submitted), `submittedAt` (timestamp).

**Milestone states:** `PENDING` → `SUBMITTED` → `APPROVED`, with side-paths to `DISPUTED` → `RESOLVED` and `AUTO_RELEASED` (time-lock). Terminal = `APPROVED`, `AUTO_RELEASED`, `RESOLVED`. A job is `COMPLETED` when **all** milestones are terminal.

### Derived per connected viewer
- **role** for the job (client / freelancer / arbitrator / observer)
- **pending withdrawal balance** per token (funds credited to you, ready to `withdraw`)
- for `SUBMITTED` milestones: **time remaining** until auto-release = `submittedAt + timelock − now` (show a countdown; when ≤ 0, a "Claim release" control appears for anyone)

### State machines (the mental model for the timeline & badges)

**Job:**
```
CREATED(funded) → FUNDED → IN_PROGRESS → COMPLETED
                         ↘ CANCELLED (client, pre-acceptance)
              IN_PROGRESS ↘ DISPUTED → back to IN_PROGRESS / COMPLETED
```

**Milestone:**
```
PENDING → SUBMITTED → APPROVED
                    ↘ (rejected) → PENDING            (resubmit)
                    ↘ DISPUTED → RESOLVED             (arbitrator splits)
                    ↘ AUTO_RELEASED                   (time-lock expiry)
```

---

## 5. Data sources ("endpoints")

In a dapp, "endpoints" are of four kinds: **contract writes** (transactions), **contract reads** (view calls), **subgraph queries** (GraphQL), and **IPFS** (file upload/fetch). Every button/form in the UI maps to one of these.

### 5A. Contract writes — transactions (require wallet + Sepolia)

| Action (button/form) | Function | Who (role) | When (state) | Inputs the UI collects |
|---|---|---|---|---|
| Create job (ETH) | `createJob(freelancer, 0x0, amounts[], timelock)` **payable** | Client | new | freelancer address, milestone amounts (ETH), timelock; send `value = Σ amounts` |
| Create job (USDC) | `approve(escrow, total)` on the token, **then** `createJob(freelancer, USDC, amounts[], timelock)` | Client | new | same, in USDC; **two-step** — check allowance, approve if needed, then create (`value = 0`) |
| Create job (USD-priced) | `createJobUsd(freelancer, usdAmounts[], timelock)` **payable** | Client | new | USD amounts (8-dec); UI quotes ETH from the feed and sends `value = quoted ETH` |
| Accept job | `acceptJob(jobId)` | Freelancer | FUNDED | — |
| Submit milestone | `submitMilestone(jobId, mIndex, cid)` | Freelancer | job IN_PROGRESS, milestone PENDING | file upload → IPFS CID |
| Approve milestone | `approveMilestone(jobId, mIndex)` | Client | milestone SUBMITTED | — |
| Reject milestone | `rejectMilestone(jobId, mIndex, reason)` | Client | milestone SUBMITTED | reason text |
| Raise dispute | `raiseDispute(jobId, mIndex, evidenceCid)` | Client **or** Freelancer | milestone SUBMITTED | evidence file → IPFS CID |
| Resolve dispute | `resolveDispute(jobId, mIndex, freelancerBps)` | Arbitrator | milestone DISPUTED | split slider 0–100% → basis points (0–10000) |
| Claim time-lock release | `claimTimelockRelease(jobId, mIndex)` | **Anyone** | milestone SUBMITTED & past deadline | — |
| Cancel job | `cancelJob(jobId)` | Client | FUNDED (pre-acceptance) | — |
| Withdraw | `withdraw(token)` | Anyone with a balance | any time | token (ETH/USDC) |

**Owner/admin (optional — only if you want an admin screen; the deployer is the owner):**
`setFeeBps(bps)`, `setArbitrator(addr)`, `withdrawFees(token, to)`, `pause()`, `unpause()`.

> **Two-step USDC flow** and **USD live-quote** are the only non-trivial write flows — design them as multi-step where the button reflects the current step ("Approve USDC" → "Create job").

### 5B. Contract reads — view calls (no wallet needed)

- `getJob(jobId)` → full Job struct · `getMilestones(jobId)` → Milestone[] · `getMilestone(jobId, i)`
- `jobCounter` → total jobs · `pendingWithdrawals(token, account)` → your withdrawable balance · `accruedFees(token)`
- `feeBps` (current fee) · `arbitrator` (global) · `MIN_TIMELOCK` / `MAX_TIMELOCK` (bounds for the create form's timelock input)
- **Chainlink ETH/USD price feed** `latestRoundData()` on `0x694AA1769357215DE4FAC081bf1f309aDC325306` → for live USD↔ETH conversion in the create form and USD-job displays.

### 5C. The Graph subgraph — GraphQL (primary read path for lists & timelines)

Endpoint: a Subgraph Studio URL (env `VITE_SUBGRAPH_URL`; if unset, fall back to direct contract reads). Entities and their shapes:

- **Job** — `id, jobId, client, freelancer, token, totalAmount, milestoneCount, timelock, state, createdAt, usdTotal, ethUsdPrice, completedAt, milestones[], activities[]`
- **Milestone** — `id, index, amount, state, deliverableCid, submittedAt, fee`
- **Activity** — `id, type, milestoneIndex, actor, timestamp, txHash, data` — **one per state change; this is the timeline feed** (types like `JOB_CREATED`, `MILESTONE_SUBMITTED`, `DISPUTE_RAISED`, `MILESTONE_APPROVED`, …)
- **Withdrawal** — `id, account, token, amount, timestamp`
- **Dispute** — `id, milestoneIndex, raisedBy, evidenceCid, resolved, freelancerBps, freelancerAmount, clientAmount, timestamp`

Typical queries the UI needs:
- **All jobs** (Home) — paginated, newest first, with state + counts.
- **My jobs** — where `client == me` OR `freelancer == me` (two lists / a filter).
- **Single job** — job + its milestones + its activities (for the timeline).
- **Open disputes** — for the arbitrator panel (disputes where `resolved == false`).
- **My withdrawals / balances** — history + current pending.

> **Subgraph lag:** a just-created job may take a few seconds to index. Design for it — e.g. an optimistic entry, a "syncing…" hint, or a manual refresh — and the app can fall back to a direct `getJob` read for the freshly created id.

### 5D. IPFS via Pinata

- **Upload** (deliverables, dispute evidence): file/JSON → Pinata → **CID**. The CID is what goes on-chain (`deliverableCid`/`evidenceCid`); the file itself lives on IPFS.
- **View/download:** `https://gateway.pinata.cloud/ipfs/<cid>`. Anywhere a CID appears (submitted milestone, dispute evidence), render a link/preview to the gateway URL.
- Design needs: a **file upload control** (drag-drop or picker) with uploading/success/error states, and a **CID/attachment display** (link + maybe filename/type).

---

## 6. Pages / routes

### `/` — Home / Jobs
- **Purpose:** discover jobs; entry to "my jobs".
- **Who:** everyone (works logged-out).
- **Shows:** list of `JobCard`s (id, client/freelancer short addresses, token, total, state badge, milestone progress e.g. "2/3 released", created time). Tabs/filters: **All jobs**, **As client**, **As freelancer** (latter two need a connected wallet). "Create job" CTA.
- **States:** loading skeletons, empty ("no jobs yet"), error.

### `/create` — Create Job (client flow)
- **Who:** connected wallet (becomes the client).
- **Form:** freelancer address; **payment mode** (ETH / USDC / USD-priced); a dynamic list of **milestones** (label + amount, add/remove, ≥1, ≤50); **timelock** (within MIN/MAX, shown as a human duration). USD mode shows a **live ETH quote** per milestone and total. USDC mode surfaces the **approve** step.
- **Actions:** submit → the relevant `createJob*` write (+ approve for USDC).
- **States:** validation errors (bad address, zero/empty amounts, self-dealing = freelancer==you, timelock out of range, value mismatch), the two-step USDC/approve state, tx lifecycle, success → navigate to the new job.

### `/job/:id` — Job Detail (the core, role-aware screen)
- **Who:** everyone; **controls vary by role + state**.
- **Shows:** job header (parties, token, total, state, arbitrator, created); a **milestone list** — each `MilestoneRow` with its amount, state badge, deliverable link (if submitted), and a **countdown** to auto-release (if SUBMITTED); a **Timeline** of activities; the viewer's **pending-withdrawal banner** if they have a balance.
- **Role/state-conditional actions** (show only what's valid):
  - *Client:* Approve / Reject(reason) / Raise dispute per SUBMITTED milestone; Cancel (if job FUNDED); Withdraw.
  - *Freelancer:* Accept (if FUNDED); Submit (if job IN_PROGRESS & milestone PENDING) via IPFS upload; Raise dispute; Withdraw.
  - *Arbitrator:* Resolve (if a milestone is DISPUTED) — opens the split control.
  - *Anyone:* "Claim release" on an expired SUBMITTED milestone.
- **States:** job-not-found, loading, each action's tx lifecycle, IPFS upload states.

### `/arbitrator` — Arbitrator Panel
- **Who:** best surfaced to an address that is an arbitrator on ≥1 job (but page is viewable by anyone).
- **Shows:** list of **open disputes** (job, milestone, who raised it, links to both parties' evidence CIDs). A **resolution control**: a 0–100% slider for the freelancer's share with a **live preview** of both payout amounts and the fee, then `resolveDispute`.
- **States:** empty ("no open disputes"), loading, tx lifecycle.

### Global shell (all pages)
- **Header:** logo/title, nav, **RainbowKit ConnectButton / account menu**, a **pending-balance / Withdraw** affordance, and the **network-guard** treatment when on the wrong chain.
- **Footer (suggested):** link to the verified Etherscan contract, "Sepolia testnet" notice, GitHub.

### `/admin` — Owner panel *(optional)*
- Fee, arbitrator, fee-withdrawal, pause — only meaningful for the deployer address; hide otherwise.

---

## 7. Component inventory (reusable pieces the design implies)

Design these once; they recur across pages. (Names are suggestions.)

| Component | Purpose / states |
|---|---|
| **ConnectButton / AccountMenu** | RainbowKit — connect, connected (address, balance), disconnect |
| **NetworkGuard** | wrong-network overlay/banner + "Switch to Sepolia" |
| **TxButton** | wraps any write: idle → confirm-in-wallet → pending → success/error; disabled in-flight; shows revert reason |
| **JobCard** | list item: parties, token, total, state badge, milestone progress |
| **StateBadge** | visual for each Job state (5) and Milestone state (7) — needs 12 distinct treatments |
| **RoleBadge** | client / freelancer / arbitrator / observer indicator |
| **MilestoneRow** | amount, state, deliverable link, per-milestone actions, countdown |
| **Timeline** | vertical activity feed from `Activity` entities (icon + actor + time + detail per type) |
| **AmountInput** | number input with ETH/USD toggle + live conversion display |
| **TokenSelect** | ETH / USDC selector (drives the approve flow) |
| **FileUpload** | drag-drop/picker → IPFS; uploading/success/error; shows resulting CID |
| **AttachmentLink** | renders a CID as a gateway link (deliverable/evidence) |
| **DisputeSplitSlider** | 0–100% freelancer share + live preview of both payouts + fee |
| **Countdown** | time-until-auto-release for SUBMITTED milestones |
| **PendingWithdrawalBanner** | "You have X ETH/USDC to withdraw" + Withdraw button |
| **AddressDisplay** | truncated address + copy + Etherscan link + (optional) ENS/avatar |
| **Empty / Loading / Error** | consistent states for every data view |
| **Toast / Notification** | tx submitted / confirmed / failed |

---

## 8. States & edge cases the design must cover

Design these — they're where dapps usually feel unfinished:

- **Not connected** (reads work; writes prompt connect) · **connecting** · **wrong network** · **connected, right network**
- **Transaction:** awaiting wallet signature · pending (mining, with a spinner + optional Etherscan link) · **success** · **reverted** (surface the reason, e.g. "not the freelancer", "milestone not submitted")
- **Empty:** no jobs · no milestones submitted yet · no open disputes · no withdrawable balance · no timeline events yet
- **Loading:** skeletons for lists, job detail, timeline
- **Not found:** job id that doesn't exist
- **Subgraph lag:** a just-created/just-updated job not yet indexed (syncing hint + RPC fallback)
- **IPFS:** upload in progress · upload failed/retry · large file warning
- **USDC approval needed** vs already approved (allowance check) · **insufficient token/ETH balance**
- **Time-lock:** not yet expired (show countdown, no claim button) vs expired (show "Claim release")
- **Value mismatch** in create (sum of milestones ≠ sent value) — validate before submit

---

## 9. Microcopy & display conventions

- **Fee:** show "1% protocol fee" and the **net** the freelancer receives (`amount − fee`) on any release/approve preview.
- **USD jobs:** display like `$500.00 (≈ 0.25 ETH @ $2,000/ETH)` using the live feed price.
- **Time-lock:** show as a human duration (e.g. "auto-releases in 3d 4h") + a live countdown when submitted.
- **Addresses:** truncate (`0x8979…F981`), copy button, link to `https://sepolia.etherscan.io/address/<addr>`.
- **Transactions:** link tx hashes to `https://sepolia.etherscan.io/tx/<hash>`.
- **State names:** use the exact enum names or friendly equivalents consistently (`FUNDED`, `IN_PROGRESS`, `SUBMITTED`, `AUTO_RELEASED`, …).
- **Testnet notice:** make it clear this is **Sepolia testnet** (no real funds) somewhere persistent.

---

## 10. Non-goals / constraints (so the design doesn't over-scope)

- **Sepolia testnet only** — no mainnet, no fiat on-ramp, no buying crypto in-app.
- **Wallet is the only identity** — no sign-up, login, email, profiles, or notifications backend.
- **Single arbitrator per job** (an address, snapshotted at creation) — not a voting panel or DAO.
- **Immutable contract** — no upgrade/settings UI beyond the optional owner panel.
- **No off-chain database** — everything is chain + subgraph + IPFS. No server to design around.
- Reputation, messaging/chat, search beyond job lists — **future work, not v1**.

---

## 11. Reference — addresses & environment the app assumes

| Thing | Value |
|---|---|
| **Escrow contract (Sepolia)** | `0x85DBE339432cd7960FADFef78e2E6981025bD4BA` ([verified](https://sepolia.etherscan.io/address/0x85DBE339432cd7960FADFef78e2E6981025bD4BA#code)) |
| Chainlink ETH/USD feed | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |
| Circle USDC (Sepolia) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Chain | Ethereum Sepolia (chainId **11155111**) |
| Explorer base | `https://sepolia.etherscan.io` |
| IPFS gateway | `https://gateway.pinata.cloud/ipfs/<cid>` |

**Env vars the app will read** (for reference — you don't need these to design, just to know what's configurable):
```
VITE_WALLETCONNECT_PROJECT_ID   # RainbowKit / WalletConnect
VITE_CONTRACT_ADDRESS           # escrow (defaults to the address above)
VITE_SEPOLIA_RPC_URL            # Alchemy
VITE_PINATA_JWT                 # IPFS uploads
VITE_SUBGRAPH_URL               # empty ⇒ fall back to direct RPC reads
```

---

## 12. Suggested screen priority (if designing incrementally)

1. **Global shell** — header + connect + network guard (everything depends on it).
2. **Job Detail** (`/job/:id`) — the richest, most role-dependent screen; get this right and the rest follows.
3. **Home / Jobs list** (`/`).
4. **Create Job** (`/create`).
5. **Arbitrator panel** (`/arbitrator`).
6. Optional: admin/owner panel.

Deliver whatever subset you like — even just the shell + Job Detail is enough to start wiring. Hand it over as React components (or HTML/CSS), and it gets integrated verbatim with the data/actions above bound in.
