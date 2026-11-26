// ─────────────────────────────────────────────────────────────
// ToastProvider.tsx — Global Toast Notifications
// Developer 3 • Paperclip MERN (Day 11)
//
// Non-blocking Linear-inspired toast notifications supporting
// success, error, warning, and info variants plus a global
// `toast:show` CustomEvent listener.
// ─────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastHelpers {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

interface ToastContextValue {
  toast: ToastHelpers;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; icon: typeof CheckCircle2; iconColor: string }
> = {
  success: {
    border: 'border-emerald-500/40 bg-zinc-900/95',
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
  },
  error: {
    border: 'border-red-500/40 bg-zinc-900/95',
    icon: AlertCircle,
    iconColor: 'text-red-400',
  },
  warning: {
    border: 'border-amber-500/40 bg-zinc-900/95',
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
  },
  info: {
    border: 'border-violet-500/40 bg-zinc-900/95',
    icon: Info,
    iconColor: 'text-violet-400',
  },
};

export function dispatchToast(
  variant: ToastVariant,
  title: string,
  description?: string,
) {
  window.dispatchEvent(
    new CustomEvent('toast:show', {
      detail: { variant, title, description },
    }),
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, description?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev.slice(-4), { id, variant, title, description }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, 4500);
    },
    [],
  );

  useEffect(() => {
    const onToastEvent = (event: Event) => {
      const custom = event as CustomEvent<{
        variant?: ToastVariant;
        title?: string;
        description?: string;
      }>;
      if (!custom.detail?.title) return;
      push(
        custom.detail.variant || 'info',
        custom.detail.title,
        custom.detail.description,
      );
    };
    window.addEventListener('toast:show', onToastEvent);
    return () => window.removeEventListener('toast:show', onToastEvent);
  }, [push]);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: {
        success: (t, d) => push('success', t, d),
        error: (t, d) => push('error', t, d),
        warning: (t, d) => push('warning', t, d),
        info: (t, d) => push('info', t, d),
      },
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast viewport */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {items.map((item) => {
          const style = VARIANT_STYLES[item.variant];
          const Icon = style.icon;
          return (
            <div
              key={item.id}
              role={item.variant === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-2xl backdrop-blur-md transition-all ${style.border}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-100">
                  {item.title}
                </p>
                {item.description && (
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                    {item.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastHelpers {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      success: (t, d) => dispatchToast('success', t, d),
      error: (t, d) => dispatchToast('error', t, d),
      warning: (t, d) => dispatchToast('warning', t, d),
      info: (t, d) => dispatchToast('info', t, d),
    };
  }
  return ctx.toast;
}
