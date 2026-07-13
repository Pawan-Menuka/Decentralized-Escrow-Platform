# Project rules — Decentralized Freelance Escrow Platform

## Git / GitHub
- **Base branch is `Develop`.** Open all PRs against `Develop`, never `main`, unless explicitly told otherwise.
- The user merges PRs themselves unless they say otherwise.

## What this project is
- A milestone-based freelance escrow protocol for Ethereum (Sepolia testnet). Single immutable Solidity contract (`contracts/FreelanceEscrow.sol`) — pull-payment fund custody, protocol fee, dispute arbitration, time-lock auto-release, later Chainlink (Price Feeds + Automation + Functions), ERC-20/USDC, a subgraph, and a React frontend.
- **`BLUEPRINT.md` at the repo root is the plan of record and live progress tracker.** It is phased (0–18) with a `Status:` line per phase and a per-phase Opus/Sonnet model-routing table (§9.0). Read it before building; update the relevant `Status:` line and commit at the end of each phase. Use the `/phase` skill to execute the next phase.

## Toolchain / build
- Hardhat 2.x + TypeScript (ethers v6) for build/test; a Foundry suite (`foundry/`) for fuzz/invariants from Phase 5.
- **Every `npm install` MUST use `--legacy-peer-deps`** (gas-reporter v2 vs toolbox peer conflict; keep `typescript` pinned to `^5.x` — the TS 7 native port crashes ts-node). Do NOT delete `node_modules`/`package-lock.json` and reinstall clean.
- Node on this machine is v20; CI uses 22. Both fine.
- Run `npx hardhat compile` / `npx hardhat test` / `npx hardhat coverage` via the Bash (Git Bash) tool, unpiped, with generous timeouts. Never run pnpm/npx through PowerShell.

## Secrets
- `.env` is git-ignored and filled by the human (Alchemy/Etherscan keys, a dedicated dev wallet key, Pinata JWT, etc.). Claude writes `.env.example` only and never fabricates or commits keys.
