// ── BACKEND CONNECTED ─────────────────────────────────────────────────────
// The typed ABI and canonical deployment are generated from the compiled artifact
// and deployments/sepolia.json by the root `sync-abi` script.
import { zeroAddress } from 'viem';
import { env } from './env';
import { freelanceEscrowAbi } from '../abi/FreelanceEscrow';

export const ESCROW_ADDRESS = env.escrowAddress;
export const USDC_ADDRESS = env.usdcAddress;

export const ESCROW_ABI = freelanceEscrowAbi;

/** Native ETH sentinel — the contract keys balances/fees by token, with 0x0 = ETH. */
export const ETH_TOKEN = zeroAddress;

export const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;
