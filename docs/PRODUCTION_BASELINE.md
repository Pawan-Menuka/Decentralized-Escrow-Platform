# Production Launch Baseline

This document records the reproducible baseline established in Production Launch Plan Phase 0. It describes the Sepolia configuration and repository state that later launch phases must preserve or deliberately migrate.

## Repository baseline

| Item | Value |
|---|---|
| Base branch | `Develop` |
| Baseline commit | `2eabe2ae97d1b4bd1f34a91fee00e18ac1b3c1bf` |
| Remote base | `origin/Develop` |
| Node.js used locally | `v20.20.2` |
| npm used locally | `10.8.2` |
| Solidity compiler | `0.8.24` |

`Develop` is the implementation base. Pull requests should target `Develop` unless the project owner explicitly changes the workflow. At baseline time the local branch exactly matched `origin/Develop`.

The untracked `Frontend Design Project/handoff` directory is preserved in place as a read-only design reference. Production work happens in the tracked `frontend/` application; code must not be built or deployed from the handoff directory.

## Sepolia configuration

| Item | Value |
|---|---|
| Chain | Ethereum Sepolia |
| Chain ID | `11155111` |
| Escrow contract | `0x85DBE339432cd7960FADFef78e2E6981025bD4BA` |
| Deployment block | `11287638` |
| Deployment transaction | `0x402843dcde248024a7bac009287ddd1b00c2a130ecdc58efc7700e27743b0130` |
| Deployer / owner at deployment | `0xF176B879e2D37ba20A8ba8e219D0FbB44Ce4e589` |
| Default arbitrator at deployment | `0xF176B879e2D37ba20A8ba8e219D0FbB44Ce4e589` |
| Initial protocol fee | `100` bps (1%) |
| Chainlink ETH/USD feed | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |
| Sepolia USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

The escrow address and deployment block must match `deployments/sepolia.json`, `frontend/.env.example`, `subgraph/subgraph.yaml`, and the README. The current deployment supports a per-job arbitrator with the default arbitrator used when the supplied address is zero.

## Fresh verification results

Dependencies were installed from each committed lockfile:

```bash
npm ci --legacy-peer-deps
npm --prefix frontend ci --legacy-peer-deps
npm --prefix subgraph ci --legacy-peer-deps
```

Results on the baseline commit:

| Check | Result |
|---|---|
| Hardhat compile | Passed; 25 Solidity files compiled |
| Hardhat tests | Passed; 143 tests |
| Solidity coverage | 98.98% statements, 93.06% branches, 100% functions, 100% lines |
| Root TypeScript | Passed after excluding the AssemblyScript subgraph from the root TS project |
| Frontend production build | Passed |
| Subgraph codegen | Passed |
| Subgraph build | Passed |
| Foundry invariants | Passed in GitHub Actions for the baseline commit |
| Slither | Passed in GitHub Actions for the baseline commit |

The CI-owned checks were verified in successful GitHub Actions run
[`31348375978`](https://github.com/Pawan-Menuka/Decentralized-Escrow-Platform/actions/runs/31348375978),
whose head SHA exactly matches the baseline commit. Its Hardhat, frontend, Foundry, and Slither jobs all completed successfully.

## Baseline findings carried forward

- Root `npm ci` reports 47 dependency vulnerabilities: 21 low, 14 moderate, and 12 high.
- Subgraph `npm ci` reports 17 dependency vulnerabilities: 5 moderate, 11 high, and 1 critical.
- Several transitive packages are deprecated, including older WalletConnect/MetaMask packages and old `glob` versions.
- The frontend build succeeds but emits a chunk-size warning; its largest generated chunk is approximately 938 KB minified.
- The frontend environment template still proposes `VITE_PINATA_JWT`. A Vite variable is public browser configuration, so this must be removed and replaced with a server-side upload flow before deployment.
- The subgraph manifest repository URL does not match the current Git remote.
- The subgraph package uses `latest` ranges and retains a `<SUBGRAPH_SLUG>` deploy placeholder.
- `BLUEPRINT.md` contains stale deployment prose around the newer contract address/transaction and should be corrected during documentation cleanup.

Do not run `npm audit fix --force` as a blanket repair. Dependency findings must be triaged and upgraded deliberately with the full compile/test/build suite rerun after each compatible update group.

## Secret-history check

`.env`, `frontend/.env`, and `frontend/.env.local` are not tracked and have no commits in the repository history inspected during Phase 0. No secret values were read or copied into this document.

## Reproduction commands

Run Node CLIs through Git Bash on this Windows project:

```bash
npm ci --legacy-peer-deps
npx hardhat compile
npx hardhat test
npx hardhat coverage
npx tsc --noEmit

npm --prefix frontend ci --legacy-peer-deps
npm --prefix frontend run build

npm --prefix subgraph ci --legacy-peer-deps
npm --prefix subgraph run codegen
npm --prefix subgraph run build
```
