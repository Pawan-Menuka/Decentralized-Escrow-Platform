// ── BACKEND CONNECTED ─────────────────────────────────────────────────────
// ESCROW_ABI is the real ABI of the deployed FreelanceEscrow contract, exported
// from artifacts/contracts/FreelanceEscrow.sol/FreelanceEscrow.json → "abi".
// Regenerate it after any contract change with the repo's `sync-abi` script.
//
// The deployed contract's names/shapes differ slightly from this app's original
// placeholder (e.g. `jobCounter` not `nextJobId`; per-token withdrawals; job ids
// start at 1). Every one of those differences is absorbed in
// src/hooks/useEscrow.ts — pages still never call the contract directly.
import ESCROW_ABI_JSON from './FreelanceEscrow.abi.json';
import { zeroAddress, type Abi } from 'viem';
import { env } from './env';

export const ESCROW_ADDRESS = env.escrowAddress;
export const USDC_ADDRESS = env.usdcAddress;

export const ESCROW_ABI = ESCROW_ABI_JSON as Abi;

/** Native ETH sentinel — the contract keys balances/fees by token, with 0x0 = ETH. */
export const ETH_TOKEN = zeroAddress;

export const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;
