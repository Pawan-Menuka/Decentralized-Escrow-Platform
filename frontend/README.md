# Holdfast frontend

The tracked production interface for the Sepolia-only Holdfast escrow demonstration. It uses React, strict TypeScript, Vite, wagmi/viem, RainbowKit, TanStack Query, and React Router.

## Setup

Use the repository's required legacy peer-dependency mode:

```bash
npm ci --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

Fill every required public value in `.env.local`. `VITE_SUBGRAPH_URL` may be left blank so the application can use its RPC fallback. All `VITE_` values are visible in the browser; never put a Pinata JWT or another secret in them.

The configured chain ID must be Sepolia (`11155111`). Invalid or missing deployment configuration produces a visible configuration screen before any contract connection is attempted.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright browsers must be installed before the end-to-end suite is run. The broader deterministic wallet lifecycle suite is scheduled for Phase 8 of the production launch plan.

## Source layout

```text
src/
  main.tsx              providers and routes
  types.ts              shared frontend domain types
  theme.ts              visual tokens and typed style helpers
  config/env.ts         runtime public-environment validation
  config/deployment.ts  generated canonical Sepolia deployment
  config/wagmi.ts       Sepolia-only wallet/RPC configuration
  config/contract.ts    generated ABI and runtime addresses
  domain/               contract-to-UI adapters and domain types
  services/read/        Graph discovery plus authoritative RPC fallback
  hooks/useEscrow.ts    React Query and transaction hooks
  lib/                  typed formatting and IPFS clients
  components/           shell and shared UI
  pages/                public and role-specific routes
```

The upload client calls `/api/ipfs`; Phase 5 adds the authenticated server-side implementation. Pinata credentials are never sent to the browser.
