import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import nexusPanelAura from '../../assets/branding/nexus-panel-aura.svg';
import { useToastStore } from '../../store/useToastStore';

export default function ToastViewport() {
  const { toasts, dismissToast } = useToastStore();

  return (
    <div className="fixed right-4 top-4 z-[100] flex w-[min(420px,calc(100vw-32px))] flex-col gap-3 font-sans">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            initial={{ opacity: 0, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.98 }}
            onClick={() => dismissToast(toast.id)}
            className="nexus-panel px-4 py-3 text-left text-white shadow-premium backdrop-blur-xl"
          >
            <img
              src={nexusPanelAura}
              alt=""
              className="nexus-ornament-bg -right-24 -top-20 h-36 w-80 max-w-none opacity-35"
              draggable="false"
            />
            <strong className="block text-xs font-bold uppercase tracking-[0.2em] text-gold">
              {toast.title}
            </strong>
            <span className="mt-1 block text-sm leading-5 text-slate-200">{toast.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
