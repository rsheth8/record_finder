"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { spring } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_ICON: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: "border-success/40 text-success",
  error: "border-error/40 text-error",
  info: "border-accent/40 text-accent",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const reducedMotion = useReducedMotion();
  // Render the toast container only after client mount to avoid SSR/hydration
  // mismatch on the portal-style fixed overlay.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted && (
        <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-full max-w-sm flex-col gap-2 md:bottom-4">
          <AnimatePresence initial={false}>
            {toasts.map((toast) => {
              const Icon = VARIANT_ICON[toast.variant];
              return (
                <motion.div
                  key={toast.id}
                  role="status"
                  layout={!reducedMotion}
                  initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
                  transition={reducedMotion ? { duration: 0 } : spring}
                  className={cn(
                    "pointer-events-auto flex items-start gap-2 rounded-lg border bg-surface/95 px-4 py-3 text-sm shadow-xl backdrop-blur",
                    VARIANT_CLASS[toast.variant],
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="flex-1 text-foreground">{toast.message}</p>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    className="focus-ring rounded-sm text-muted transition-colors hover:text-foreground"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
