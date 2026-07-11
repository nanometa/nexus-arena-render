import { create } from 'zustand';

export const useToastStore = create((set) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          tone: 'error',
          title: 'Action failed',
          message: 'Something went wrong.',
          ...toast,
        },
      ].slice(-4),
    }));
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
    }, toast?.duration || 4200);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
