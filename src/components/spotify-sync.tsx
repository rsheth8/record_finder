"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, CheckCircle2 } from "lucide-react";

export function SpotifySync() {
  const { data: session, status } = useSession();
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done" | "error">("idle");

  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    let cancelled = false;

    async function sync() {
      setSyncState("syncing");
      try {
        const res = await fetch("/api/spotify/top");
        if (!cancelled) {
          setSyncState(res.ok ? "done" : "error");
        }
      } catch {
        if (!cancelled) setSyncState("error");
      }
    }

    sync();
    return () => {
      cancelled = true;
    };
  }, [session, status]);

  if (status !== "authenticated" || syncState === "idle") return null;

  if (syncState === "syncing") {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Syncing your Spotify listening history...
      </p>
    );
  }

  if (syncState === "done") {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        Spotify taste profile synced.
      </p>
    );
  }

  return (
    <p className="text-sm text-amber-400">
      Could not sync Spotify — check your API credentials.
    </p>
  );
}
