import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createPublicClient, http, isAddress, parseEventLogs } from 'viem';
import { useWriteContract } from 'wagmi';
import {
  GENESIS_PACK_ADDRESS,
  LITVM_CHAIN_ID,
  LITVM_RPC_URL,
  shortAddress,
  walletErrorMessage,
} from '../../LayetGame/genesisPackClient';
import {
  fetchPackStatus,
  fetchPlayerDashboard,
  registerPackMint,
  registerPackOpen,
} from '../../LayetGame/packApi';
import genesisPackArt from '../../LayetGame/assets/packs/nexus-genesis-pack.png';
import { useNexusStore } from '../../store/useNexusStore';
import { useToastStore } from '../../store/useToastStore';
import { litvmTestnet } from '../../providers/NexusWeb3Provider';

const GENESIS_PACK_VIEM_ABI = [
  {
    type: 'event',
    name: 'PackMinted',
    inputs: [
      { indexed: true, name: 'player', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'PackOpened',
    inputs: [
      { indexed: true, name: 'player', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'MAX_SUPPLY',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'CARDS_PER_PACK',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalMinted',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalOpened',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'mintPack',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'openPack',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
];

const publicClient = createPublicClient({
  chain: litvmTestnet,
  transport: http(LITVM_RPC_URL),
});

function tokenFromReceipt(receipt, eventName) {
  const events = parseEventLogs({
    abi: GENESIS_PACK_VIEM_ABI,
    eventName,
    logs: receipt.logs || [],
  });
  return events[0]?.args?.tokenId?.toString();
}

function isRejected(error) {
  const message = String(error?.shortMessage || error?.message || error || '').toLowerCase();
  return error?.code === 4001 || message.includes('reject') || message.includes('denied');
}

async function readChainDrop() {
  if (!GENESIS_PACK_ADDRESS || !isAddress(GENESIS_PACK_ADDRESS)) return null;
  const contract = {
    address: GENESIS_PACK_ADDRESS,
    abi: GENESIS_PACK_VIEM_ABI,
  };
  const [maxSupply, cardsPerPack, totalMinted, totalOpened] = await Promise.all([
    publicClient.readContract({ ...contract, functionName: 'MAX_SUPPLY' }),
    publicClient.readContract({ ...contract, functionName: 'CARDS_PER_PACK' }),
    publicClient.readContract({ ...contract, functionName: 'totalMinted' }),
    publicClient.readContract({ ...contract, functionName: 'totalOpened' }),
  ]);

  return {
    maxSupply: Number(maxSupply),
    cardsPerPack: Number(cardsPerPack),
    totalMinted: Number(totalMinted),
    totalOpened: Number(totalOpened),
  };
}

export default function GenesisDrop() {
  const { writeContractAsync } = useWriteContract();
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const setPlayerAccount = useNexusStore((state) => state.setPlayerAccount);
  const pushToast = useToastStore((state) => state.pushToast);
  const [packStatus, setPackStatus] = useState(null);
  const [chainDrop, setChainDrop] = useState(null);
  const [message, setMessage] = useState('Ready for deployment.');
  const [busy, setBusy] = useState(false);

  const walletAddress = playerAccount?.walletAddress || '';
  const packs = playerAccount?.packs || [];
  const inventory = playerAccount?.inventory || [];
  const activePack = packs.find((pack) => pack.status === 'minted');
  const drop = chainDrop || packStatus?.drop || {};
  const contractReady = Boolean(GENESIS_PACK_ADDRESS && isAddress(GENESIS_PACK_ADDRESS));
  const canMint = Boolean(contractReady && walletAddress && !activePack && inventory.length === 0);
  const canOpen = Boolean(contractReady && walletAddress && activePack);

  const showError = (error, fallback = 'Action failed.') => {
    const nextMessage = isRejected(error)
      ? 'Wallet request rejected.'
      : walletErrorMessage(error) || fallback;
    setMessage(nextMessage);
    pushToast({
      title: 'Action failed',
      message: nextMessage,
    });
  };

  const refreshDashboard = async () => {
    if (!walletAddress) return null;
    const data = await fetchPlayerDashboard(walletAddress);
    const dashboard = { ...data, authenticated: true };
    setPlayerAccount(dashboard);
    return dashboard;
  };

  const loadDrop = async () => {
    try {
      const [serverStatus, onchainDrop] = await Promise.all([
        fetchPackStatus(),
        contractReady ? readChainDrop().catch(() => null) : Promise.resolve(null),
      ]);
      setPackStatus(serverStatus);
      if (onchainDrop) setChainDrop(onchainDrop);
    } catch (error) {
      showError(error, 'Drop status unavailable.');
    }
  };

  useEffect(() => {
    loadDrop();
    refreshDashboard().catch((error) => showError(error, 'Profile sync failed.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const handleMint = async () => {
    setBusy(true);
    setMessage('Minting Genesis Pack...');
    try {
      const hash = await writeContractAsync({
        address: GENESIS_PACK_ADDRESS,
        abi: GENESIS_PACK_VIEM_ABI,
        functionName: 'mintPack',
        chainId: LITVM_CHAIN_ID,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const tokenId = tokenFromReceipt(receipt, 'PackMinted');
      if (!tokenId) throw new Error('PackMinted event not found.');
      await registerPackMint({
        walletAddress,
        tokenId,
        txHash: hash,
        displayName: playerAccount?.profile?.display_name || 'Pilot',
        sessionToken: playerAccount?.sessionToken,
      });
      await refreshDashboard();
      await loadDrop();
      setMessage(`Genesis Pack #${tokenId} minted.`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async () => {
    if (!activePack) return;
    setBusy(true);
    setMessage(`Opening Pack #${activePack.token_id}...`);
    try {
      const hash = await writeContractAsync({
        address: GENESIS_PACK_ADDRESS,
        abi: GENESIS_PACK_VIEM_ABI,
        functionName: 'openPack',
        args: [Number(activePack.token_id)],
        chainId: LITVM_CHAIN_ID,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const tokenId = tokenFromReceipt(receipt, 'PackOpened') || String(activePack.token_id);
      const data = await registerPackOpen({
        walletAddress,
        tokenId,
        txHash: hash,
        displayName: playerAccount?.profile?.display_name || 'Pilot',
        sessionToken: playerAccount?.sessionToken,
      });
      await refreshDashboard();
      await loadDrop();
      setMessage(`${data.cards?.length || 20} cards added to inventory.`);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="nexus-genesis-drop"
    >
      <div className="relative py-3">
        <div className="relative flex items-start gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-sm bg-gold/20 blur-2xl" />
            <img
              className="relative h-36 w-24 object-cover drop-shadow-[0_18px_28px_rgba(0,0,0,0.74)]"
              src={genesisPackArt}
              alt="Nexus Genesis Pack"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold/80">
              Genesis Drop
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase leading-tight text-white">
              Genesis Pack
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              One pack per wallet. Open it to reveal a balanced twenty-card command deck.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 border-y border-white/10">
        <DropStat label="Minted" value={`${drop.totalMinted ?? 0}/${drop.maxSupply ?? 5000}`} />
        <DropStat label="Opened" value={drop.totalOpened ?? 0} />
        <DropStat label="Wallet" value={shortAddress(walletAddress)} />
        <DropStat label="Inventory" value={`${inventory.length}/20`} />
      </div>

      <div className="mt-5 grid gap-3">
        <PremiumButton onClick={handleMint} disabled={busy || !canMint}>
          Mint Pack
        </PremiumButton>
        <PremiumButton onClick={handleOpen} disabled={busy || !canOpen}>
          Open / Burn
        </PremiumButton>
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}>
          <Link
            to="/arena"
            className="block rounded-sm border border-gold/60 bg-gold px-4 py-3 text-center text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-white"
          >
            Enter Arena
          </Link>
        </motion.div>
      </div>

      <p className="mt-4 border-l border-gold/30 pl-3 text-xs leading-5 text-slate-400">
        {contractReady ? message : 'Genesis contract address is not configured.'}
      </p>
    </motion.section>
  );
}

function DropStat({ label, value }) {
  return (
    <div className="py-3">
      <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </span>
      <strong className="mt-1 block truncate font-mono text-sm text-white">{value}</strong>
    </div>
  );
}

function PremiumButton({ children, disabled, onClick }) {
  return (
    <motion.button
      type="button"
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      disabled={disabled}
      onClick={onClick}
      className="nexus-ccg-button border border-gold/20 bg-white/[0.06] px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:border-gold/70 hover:bg-gold/15 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </motion.button>
  );
}
