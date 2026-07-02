"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";
import { VinylLoader } from "@/components/ui/vinyl-loader";

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
    return <VinylLoader variant="inline" context="spotify" />;
  }

  if (syncState === "done") {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" />
        Spotify taste profile synced.
      </p>
    );
  }

  return (
    <p className="text-sm text-warning">
      Could not sync Spotify — check your API credentials.
    </p>
  );
}
