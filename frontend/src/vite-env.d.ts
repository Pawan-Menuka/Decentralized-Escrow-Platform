/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_ESCROW_ADDRESS?: string;
  readonly VITE_USDC_ADDRESS?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_SEPOLIA_RPC_URL?: string;
  readonly VITE_SUBGRAPH_URL?: string;
  readonly VITE_IPFS_GATEWAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
