"use client";

import { useEffect, useState } from "react";
import {
  LOADING_MESSAGES,
  type LoadingContext,
} from "@/lib/loading-messages";
import { cn } from "@/lib/utils";

function VinylDisc({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass =
    size === "sm" ? "h-14 w-14" : size === "lg" ? "h-28 w-28" : "h-20 w-20";
  const labelClass =
    size === "sm" ? "h-5 w-5" : size === "lg" ? "h-10 w-10" : "h-7 w-7";

  return (
    <div className={cn("vinyl-loader-disc relative", sizeClass)}>
      <div className="vinyl-loader-grooves absolute inset-0 rounded-full" />
      <div
        className={cn(
          "vinyl-loader-label absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
          labelClass,
        )}
      />
      <div className="vinyl-loader-spindle absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-300" />
    </div>
  );
}

function CyclingMessage({
  messages,
  className,
}: {
  messages: readonly string[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (messages.length <= 1) return;

    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % messages.length);
        setVisible(true);
      }, 280);
    }, 2600);

    return () => clearInterval(interval);
  }, [messages]);

  return (
    <p
      className={cn(
        "text-sm text-zinc-400 transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {messages[index]}
    </p>
  );
}

export function VinylLoader({
  context = "general",
  variant = "section",
  message,
  className,
}: {
  context?: LoadingContext;
  variant?: "overlay" | "section" | "inline";
  message?: string;
  className?: string;
}) {
  const messages = message ? [message] : LOADING_MESSAGES[context];
  const size = variant === "inline" ? "sm" : variant === "overlay" ? "lg" : "md";

  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative">
        <div className="vinyl-loader-glow absolute inset-0 scale-150 rounded-full bg-violet-600/20 blur-2xl" />
        <VinylDisc size={size} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-400/80">
          Record Finder
        </p>
        <CyclingMessage
          messages={messages}
          className={variant === "inline" ? "text-xs" : "text-sm"}
        />
      </div>
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className="vinyl-loader-overlay fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3 py-2">
        <VinylDisc size="sm" />
        <CyclingMessage messages={messages} className="text-xs text-zinc-400" />
      </div>
    );
  }

  return <div className="flex min-h-[280px] items-center justify-center py-16">{content}</div>;
}
