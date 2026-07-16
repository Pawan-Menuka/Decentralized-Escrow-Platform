# Holdfast — frontend

React + Vite + wagmi/viem + RainbowKit implementation of the approved Holdfast designs (dark ledger system, IBM Plex, milestone state rail, role-aware actions).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

## Backend: connected ✅

This app is wired to the deployed `FreelanceEscrow` contract on Sepolia
(`0x85DBE339432cd7960FADFef78e2E6981025bD4BA`, verified on Etherscan). The
handoff steps below are **done** — recorded here for reference:

1. **`src/config/contract.js`** — `ESCROW_ABI` now imports the real compiled ABI
   (`FreelanceEscrow.abi.json`). Regenerate it after any contract change with
   `npm run sync-abi` from the repo root (it also updates the subgraph's copy).
2. **`src/hooks/useEscrow.js`** — the adapter. The deployed contract differs from
   the original placeholder in a few ways, all absorbed here so **pages were not
   touched**: `jobCounter` (not `nextJobId`), job ids start at **1**, the `Job`
   struct exposes a `state` enum + `totalAmount` (mapped to `accepted`/`cancelled`
   /`total`), milestones expose `deliverableCid` (mapped to `cid`), and
   balances/withdrawals are **per-token** (`pendingWithdrawals(token, who)` /
   `withdraw(token)`).
3. **`src/theme.js`** — `STATE` now matches the contract's `MilestoneState`, whose
   index 0 is a `NONE` sentinel (so the list is offset by one). `FEE_BPS` in
   `src/lib/format.js` already matched the contract's 1%.
4. **Chain** — `src/config/wagmi.js` (`ACTIVE_CHAIN`) is Sepolia, matching the
   deployment.

### What you still need to supply

Copy `.env.example` → `.env.local`. The contract/USDC addresses are pre-filled;
you only need two of your own:

- `VITE_WALLETCONNECT_PROJECT_ID` — free at cloud.reown.com (RainbowKit needs it;
  without a real one the wallet modal logs an allowlist error)
- `VITE_PINATA_JWT` — free at pinata.cloud, for the IPFS deliverable/evidence uploads

## Structure

```
src/
  main.jsx             providers (wagmi, RainbowKit, router) + routes
  theme.js             design tokens, state colors/labels, btn/ticket styles
  config/wagmi.js      chain + RainbowKit config
  config/contract.js   address + ABI  ← paste yours here
  hooks/useEscrow.js   ALL contract reads/writes (useJob, useMyJobs, useEscrowWrite…)
  lib/format.js        amount/fee/countdown formatting
  lib/ipfs.js          Pinata upload → CID
  components/          Shell (nav+wallet+network gate), TxButton (tx lifecycle),
                       StateRail (milestone state machine), MoneyBar
  pages/               Landing, Jobs, CreateJob, JobDetail, ArbitratorDesk
```

## Notes

- **Roles are real**: pages derive client/freelancer/arbitrator/observer from the connected address vs. the job's parties — the design-review role switcher from the mockups is gone.
- **Tx lifecycle** ("Confirm in your wallet… → Sending → Done ✓") is wired to wagmi's `useWriteContract` + `useWaitForTransactionReceipt` via `TxButton`.
- **USDC** create-job flow does the real two-signature approve → createJob sequence.
- `useMyJobs` reads every job and filters client-side — fine for a testnet; swap in a subgraph/indexer for production (marked with TODO).
- The activity journal from the mockups needs event history — wire it to your subgraph or `getLogs`; the design is in the `.dc.html` mockups.
