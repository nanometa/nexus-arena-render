import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from '@wagmi/connectors/injected';
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

const wagmiConfig = createConfig({
  chains: [litvmTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [litvmTestnet.id]: http(LITVM_RPC_URL),
  },
});

export default function NexusWeb3Provider({ children }) {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
