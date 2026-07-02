"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { HTMLAttributes, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  title?: string;
}

export function Modal({ open, onClose, title, className, children, ...props }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl focus:outline-none",
          className,
        )}
        {...props}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
