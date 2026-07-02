"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

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
  success: "border-emerald-600/40 text-emerald-200",
  error: "border-red-600/40 text-red-200",
  info: "border-violet-600/40 text-violet-200",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

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
      {typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
            {toasts.map((toast) => {
              const Icon = VARIANT_ICON[toast.variant];
              return (
                <div
                  key={toast.id}
                  role="status"
                  className={cn(
                    "pointer-events-auto flex items-start gap-2 rounded-lg border bg-zinc-900/95 px-4 py-3 text-sm shadow-xl backdrop-blur",
                    VARIANT_CLASS[toast.variant],
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="flex-1 text-zinc-100">{toast.message}</p>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    className="text-zinc-500 hover:text-zinc-300"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
