import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import connectWalletLabel from '../../assets/branding/connect-wallet-label.svg';
import connectingWalletLabel from '../../assets/branding/connecting-wallet-label.svg';
import nexusArenaWordmark from '../../assets/branding/nexus-arena-wordmark.svg';
import nexusPanelAura from '../../assets/branding/nexus-panel-aura.svg';
import nexusSigil from '../../assets/branding/nexus-ui-sigil.svg';
import landingBackground from '../../assets/backgrounds/nexus-landing-v1.png';
import { warmGameServer } from '../../LayetGame/packApi';
import { useWalletLogin } from './useWalletLogin';

export default function WalletLanding() {
  const { connectAndSign, isPending } = useWalletLogin();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void warmGameServer();
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    try {
      await connectAndSign();
    } catch (error) {
      // useWalletLogin already displays the contextual error toast.
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-6 text-white"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(2,6,23,0.9), rgba(15,23,42,0.42), rgba(2,6,23,0.9)), url(${landingBackground})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(245,211,138,0.2),transparent_31%),radial-gradient(circle_at_66%_50%,rgba(37,99,235,0.18),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.78))]" />
      <img
        src={nexusSigil}
        alt=""
        className="nexus-ornament-bg left-1/2 top-1/2 h-[860px] w-[860px] -translate-x-1/2 -translate-y-1/2 opacity-42"
        draggable="false"
      />
      <img
        src={nexusPanelAura}
        alt=""
        className="nexus-ornament-bg left-1/2 top-[18%] h-80 w-[900px] max-w-none -translate-x-1/2 opacity-60"
        draggable="false"
      />
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 flex w-full max-w-4xl flex-col items-center text-center"
      >
        <motion.img
          src={nexusArenaWordmark}
          alt="NEXUS ARENA Web3 Collectible Card Game Play"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.8, ease: 'easeOut' }}
          className="w-[min(760px,92vw)] select-none drop-shadow-[0_32px_90px_rgba(37,99,235,0.45)]"
          draggable="false"
        />
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -3, boxShadow: '0 18px 48px rgba(245, 211, 138, 0.22)' }}
          whileTap={{ scale: 0.98 }}
          transition={{ delay: 0.58, duration: 0.55 }}
          onClick={handleConnect}
          disabled={busy || isPending}
          aria-label={busy || isPending ? 'Connecting wallet' : 'Connect wallet'}
          className="nexus-ccg-button mt-8 border border-gold/70 bg-white/10 px-8 py-4 shadow-premium backdrop-blur-xl transition hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
        >
          <img
            src={busy || isPending ? connectingWalletLabel : connectWalletLabel}
            alt=""
            className="h-5 w-auto select-none"
            draggable="false"
          />
        </motion.button>
      </motion.section>
    </main>
  );
}
