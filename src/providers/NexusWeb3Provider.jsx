import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
} from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { LITVM_CHAIN_ID, LITVM_RPC_URL } from '../LayetGame/genesisPackClient';

export const litvmTestnet = {
  id: LITVM_CHAIN_ID,
  name: 'LitVM Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'LitVM',
    symbol: 'LIT',
  },
  rpcUrls: {
    default: { http: [LITVM_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: 'LiteForge Explorer',
      url: 'https://liteforge.explorer.caldera.xyz',
    },
  },
  testnet: true,
};

const walletConnectProjectId =
  process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || 'nexus-arena-injected-wallets';
const appUrl =
  typeof window !== 'undefined' ? window.location.origin : 'https://nexusarena.pro';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Nexus Arena wallets',
      wallets: [metaMaskWallet, rabbyWallet, injectedWallet],
    },
  ],
  {
    appName: 'Nexus Arena',
    appDescription: 'Web3 board-control collectible card game on LitVM Testnet.',
    appUrl,
    appIcon: '/game-emblem.png',
    projectId: walletConnectProjectId,
  }
);

const wagmiConfig = createConfig({
  chains: [litvmTestnet],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    [litvmTestnet.id]: http(LITVM_RPC_URL),
  },
});

const nexusRainbowTheme = darkTheme({
  accentColor: '#e7c66a',
  accentColorForeground: '#050914',
  borderRadius: 'small',
  fontStack: 'system',
  overlayBlur: 'small',
});

nexusRainbowTheme.colors.modalBackground = '#071124';
nexusRainbowTheme.colors.modalBorder = 'rgba(77, 195, 255, 0.34)';
nexusRainbowTheme.colors.modalText = '#f8fafc';
nexusRainbowTheme.colors.modalTextDim = '#8293ad';
nexusRainbowTheme.colors.modalTextSecondary = '#b8c5d8';
nexusRainbowTheme.colors.generalBorder = 'rgba(231, 198, 106, 0.28)';
nexusRainbowTheme.colors.generalBorderDim = 'rgba(77, 195, 255, 0.16)';
nexusRainbowTheme.colors.menuItemBackground = 'rgba(30, 64, 115, 0.42)';
nexusRainbowTheme.colors.modalBackdrop = 'rgba(1, 5, 16, 0.82)';
nexusRainbowTheme.shadows.dialog = '0 30px 100px rgba(0, 0, 0, 0.72)';
nexusRainbowTheme.shadows.selectedWallet = '0 0 24px rgba(77, 195, 255, 0.24)';
nexusRainbowTheme.radii.modal = '10px';
nexusRainbowTheme.radii.modalMobile = '10px';

export default function NexusWeb3Provider({ children }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={litvmTestnet}
          modalSize="compact"
          showRecentTransactions={false}
          theme={nexusRainbowTheme}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
