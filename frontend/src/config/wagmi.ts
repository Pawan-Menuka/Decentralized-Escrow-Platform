import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { env } from './env';

export const ACTIVE_CHAIN = sepolia;

export const wagmiConfig = getDefaultConfig({
  appName: 'Holdfast',
  projectId: env.walletConnectProjectId || 'configuration-required',
  chains: [ACTIVE_CHAIN],
  transports: { [sepolia.id]: http(env.sepoliaRpcUrl) },
  ssr: false,
});

export const EXPLORER = 'https://sepolia.etherscan.io';
