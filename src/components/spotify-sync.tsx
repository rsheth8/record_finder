"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";
import { VinylLoader } from "@/components/ui/vinyl-loader";

type SyncStats = {
  savedAlbums: number;
  savedTracks: number;
  recentlyPlayed: number;
};

export function SpotifySync() {
  const { data: session, status } = useSession();
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [stats, setStats] = useState<SyncStats | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    let cancelled = false;

    async function sync() {
      setSyncState("syncing");
      try {
        const res = await fetch("/api/spotify/top", { method: "POST" });
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            setStats(data.stats ?? null);
            setSyncState("done");
          } else {
            setSyncState("error");
          }
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
    const detail =
      stats &&
      (stats.savedAlbums > 0 || stats.recentlyPlayed > 0)
        ? `Analyzed ${stats.savedAlbums} saved albums, ${stats.recentlyPlayed} recent plays.`
        : "Spotify taste profile synced.";

    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" />
        {detail}
      </p>
    );
  }

  return (
    <p className="text-sm text-warning">
      Could not sync Spotify — check your API credentials.
    </p>
  );
}
