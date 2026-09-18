# FreelanceEscrow subgraph

The subgraph indexes the Sepolia deployment configured in `subgraph.yaml`.

## Verify locally

```bash
npm ci --legacy-peer-deps
npm run codegen
npm test
npm run build
```

## Deploy

Authenticate once with Subgraph Studio, then pass the Studio slug as the final
argument instead of storing a repository-specific placeholder in `package.json`:

```bash
graph auth --studio <DEPLOY_KEY>
npm run deploy -- <SUBGRAPH_SLUG>
```

The deploy key is a secret and must never be committed. Before deploying a new
contract, update the address and start block together and regenerate the ABI.

## Data-quality fields

`Job.arbitratorVerified`, `Job.milestonesHydrated`, and
`Milestone.amountVerified` distinguish values confirmed by contract calls or
events from resilient placeholder entities. Consumers must use an RPC read when
the corresponding flag is false; a zero amount with `amountVerified: false` is
not a verified zero-value milestone.
