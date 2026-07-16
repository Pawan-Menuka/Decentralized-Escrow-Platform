import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, mainnet } from 'wagmi/chains';

export const ACTIVE_CHAIN = sepolia; // switch to mainnet at launch

export const wagmiConfig = getDefaultConfig({
  appName: 'Holdfast',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [ACTIVE_CHAIN],
  ssr: false,
});

export const EXPLORER = ACTIVE_CHAIN.id === mainnet.id ? 'https://etherscan.io' : 'https://sepolia.etherscan.io';
