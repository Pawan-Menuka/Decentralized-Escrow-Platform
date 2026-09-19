import { getAddress, isAddress, zeroAddress, type Address } from 'viem';
import { SEPOLIA_DEPLOYMENT } from './deployment';

const EXPECTED_CHAIN_ID = SEPOLIA_DEPLOYMENT.chainId;
const raw = import.meta.env;

function address(value: string | undefined, name: string, issues: string[]): Address {
  if (!value || !isAddress(value)) {
    issues.push(`${name} must be a valid Ethereum address.`);
    return zeroAddress;
  }
  return getAddress(value);
}

function url(value: string | undefined, name: string, issues: string[], required = true): string | undefined {
  if (!value) {
    if (required) issues.push(`${name} is required.`);
    return undefined;
  }
  try {
    return new URL(value).toString();
  } catch {
    issues.push(`${name} must be a valid URL.`);
    return undefined;
  }
}

const issues: string[] = [];
const chainId = Number(raw.VITE_CHAIN_ID);
if (chainId !== EXPECTED_CHAIN_ID) {
  issues.push(`VITE_CHAIN_ID must be ${EXPECTED_CHAIN_ID} (Sepolia).`);
}

export const env = Object.freeze({
  chainId: EXPECTED_CHAIN_ID,
  escrowAddress: address(raw.VITE_ESCROW_ADDRESS, 'VITE_ESCROW_ADDRESS', issues),
  usdcAddress: address(raw.VITE_USDC_ADDRESS, 'VITE_USDC_ADDRESS', issues),
  walletConnectProjectId: raw.VITE_WALLETCONNECT_PROJECT_ID?.trim() ?? '',
  sepoliaRpcUrl: url(raw.VITE_SEPOLIA_RPC_URL, 'VITE_SEPOLIA_RPC_URL', issues),
  subgraphUrl: url(raw.VITE_SUBGRAPH_URL, 'VITE_SUBGRAPH_URL', issues, false),
  ipfsGatewayUrl: url(raw.VITE_IPFS_GATEWAY_URL, 'VITE_IPFS_GATEWAY_URL', issues),
});

if (env.escrowAddress !== zeroAddress && env.escrowAddress.toLowerCase() !== SEPOLIA_DEPLOYMENT.contractAddress.toLowerCase()) {
  issues.push('VITE_ESCROW_ADDRESS does not match the canonical Sepolia deployment.');
}
if (env.usdcAddress !== zeroAddress && env.usdcAddress.toLowerCase() !== SEPOLIA_DEPLOYMENT.usdcAddress.toLowerCase()) {
  issues.push('VITE_USDC_ADDRESS does not match the supported Sepolia USDC address.');
}

if (!env.walletConnectProjectId) {
  issues.push('VITE_WALLETCONNECT_PROJECT_ID is required.');
}

export const configurationIssues = Object.freeze(issues);
export const hasValidConfiguration = configurationIssues.length === 0;
