"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { FeedbackSignal } from "@/lib/types";
import { ThumbsUp, ThumbsDown, Disc3 } from "lucide-react";

const ACTIONS: {
  signal: FeedbackSignal;
  label: string;
  icon: typeof ThumbsUp;
  toast: string;
}[] = [
  { signal: "like", label: "Love it", icon: ThumbsUp, toast: "We'll find more like this" },
  { signal: "dislike", label: "Not for me", icon: ThumbsDown, toast: "We'll show fewer like this" },
  { signal: "own", label: "Already own", icon: Disc3, toast: "Hidden from your picks" },
];

export function FeedbackButtons({
  discogsReleaseId,
  artist,
  initialSignal,
}: {
  discogsReleaseId: number;
  artist: string;
  initialSignal: FeedbackSignal | null;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [signal, setSignal] = useState<FeedbackSignal | null>(initialSignal);
  const [loading, setLoading] = useState(false);

  async function choose(next: FeedbackSignal, toastMsg: string) {
    if (!session) {
      router.push("/");
      showToast("Connect Spotify to tune your recommendations", "info");
      return;
    }

    setLoading(true);
    try {
      if (signal === next) {
        // Toggle off.
        await fetch(`/api/feedback?discogsReleaseId=${discogsReleaseId}`, {
          method: "DELETE",
        });
        setSignal(null);
        showToast("Feedback cleared", "info");
      } else {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ discogsReleaseId, artist, signal: next }),
        });
        setSignal(next);
        showToast(toastMsg, "success");
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACTIONS.map(({ signal: s, label, icon: Icon, toast }) => {
        const active = signal === s;
        return (
          <button
            key={s}
            type="button"
            disabled={loading}
            onClick={() => choose(s, toast)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors disabled:opacity-50",
              active
                ? "border-violet-500 bg-violet-600/20 text-violet-200"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100",
            )}
          >
            <Icon className={cn("h-4 w-4", active && "fill-current")} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
