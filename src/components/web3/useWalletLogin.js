import { useState } from 'react';
import { isAddress } from 'viem';
import { useAccount, useConnect, useSignMessage, useSwitchChain } from 'wagmi';
import {
  LITVM_CHAIN_ID,
  createWalletLoginMessage,
  defaultPilotName,
  hasWalletProvider,
  walletErrorMessage,
} from '../../LayetGame/genesisPackClient';
import { createPlayerSession, warmGameServer } from '../../LayetGame/packApi';
import { useNexusStore } from '../../store/useNexusStore';
import { useToastStore } from '../../store/useToastStore';

function isRejected(error) {
  const message = String(error?.shortMessage || error?.message || error || '').toLowerCase();
  return error?.code === 4001 || message.includes('reject') || message.includes('denied');
}

export function useWalletLogin() {
  const { address, chainId } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const setPlayerAccount = useNexusStore((state) => state.setPlayerAccount);
  const pushToast = useToastStore((state) => state.pushToast);

  const connectAndSign = async (displayName = '') => {
    setIsAuthenticating(true);
    const serverReady = warmGameServer();

    try {
      if (!hasWalletProvider()) {
        throw new Error('Install MetaMask or another EVM wallet.');
      }

      let walletAddress = address;
      if (!walletAddress) {
        const connector = connectors[0];
        if (!connector) throw new Error('No injected wallet connector found.');
        const result = await connectAsync({ connector, chainId: LITVM_CHAIN_ID });
        walletAddress = result.accounts?.[0];
      }

      if (chainId && chainId !== LITVM_CHAIN_ID) {
        await switchChainAsync({ chainId: LITVM_CHAIN_ID });
      }

      if (!walletAddress || !isAddress(walletAddress)) {
        throw new Error('Wallet address unavailable.');
      }

      const requestedName = String(displayName || '').trim().slice(0, 18);
      const resolvedDisplayName = requestedName || defaultPilotName(walletAddress);
      const message = createWalletLoginMessage({
        walletAddress,
        displayName: resolvedDisplayName,
      });
      const signature = await signMessageAsync({ message, account: walletAddress });
      await serverReady;
      const dashboard = await createPlayerSession({
        walletAddress,
        displayName: requestedName,
        message,
        signature,
      });

      setPlayerAccount({ ...dashboard, authenticated: true });
      return { ...dashboard, authenticated: true };
    } catch (error) {
      const message = isRejected(error)
        ? 'User rejected the signature request.'
        : walletErrorMessage(error);
      pushToast({
        title: 'Wallet connection failed',
        message,
      });
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  return {
    connectAndSign,
    isPending: isPending || isAuthenticating,
  };
}
