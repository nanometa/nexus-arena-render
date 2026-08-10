import { useCallback, useState } from 'react';
import { isAddress } from 'viem';
import { useAccount, useSwitchChain } from 'wagmi';
import {
  LITVM_CHAIN_ID,
  walletErrorMessage,
} from '../../LayetGame/genesisPackClient';
import { createPlayerSession } from '../../LayetGame/packApi';
import { signInWithWallet } from '../../lib/supabaseClient';
import { useNexusStore } from '../../store/useNexusStore';
import { useToastStore } from '../../store/useToastStore';

function isRejected(error) {
  const message = String(error?.shortMessage || error?.message || error || '').toLowerCase();
  return error?.code === 4001 || message.includes('reject') || message.includes('denied');
}

function loginErrorMessage(error) {
  const message = String(error?.shortMessage || error?.message || error || '');
  if (message.toLowerCase().includes('failed to fetch')) {
    return 'Game server unavailable. Please retry in a moment.';
  }
  return walletErrorMessage(error);
}

export function useWalletLogin() {
  const { address, chainId, connector: connectedConnector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const setPlayerAccount = useNexusStore((state) => state.setPlayerAccount);
  const pushToast = useToastStore((state) => state.pushToast);

  const connectAndSign = useCallback(async (displayName = '') => {
    setIsAuthenticating(true);

    try {
      const walletAddress = address;
      const walletConnector = connectedConnector;

      if (!walletAddress || !walletConnector) {
        throw new Error('Choose a wallet in the Nexus Arena connection window.');
      }

      if (chainId && chainId !== LITVM_CHAIN_ID) {
        await switchChainAsync({ chainId: LITVM_CHAIN_ID });
      }

      if (!walletAddress || !isAddress(walletAddress)) {
        throw new Error('Wallet address unavailable.');
      }

      const requestedName = String(displayName || '').trim().slice(0, 18);
      const walletProvider = await walletConnector?.getProvider?.();
      if (!walletProvider?.request) {
        throw new Error('The selected wallet provider is unavailable. Reconnect your wallet.');
      }
      await signInWithWallet(walletProvider, walletAddress);
      const dashboard = await createPlayerSession({
        walletAddress,
        displayName: requestedName,
      });

      setPlayerAccount({ ...dashboard, authenticated: true });
      return { ...dashboard, authenticated: true };
    } catch (error) {
      const message = isRejected(error)
        ? 'User rejected the signature request.'
        : loginErrorMessage(error);
      pushToast({
        title: 'Wallet connection failed',
        message,
      });
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }, [
    address,
    chainId,
    connectedConnector,
    pushToast,
    setPlayerAccount,
    switchChainAsync,
  ]);

  return {
    connectAndSign,
    isPending: isAuthenticating,
  };
}
