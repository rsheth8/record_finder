"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Music } from "lucide-react";

export function SpotifyConnect({
  spotifyConfigured = true,
}: {
  spotifyConfigured?: boolean;
}) {
  const { data: session, status } = useSession();

  if (!spotifyConfigured) {
    return (
      <p className="text-sm text-warning">
        Add your Spotify Client ID and Secret to <code>.env.local</code> to
        enable connection.
      </p>
    );
  }

  if (status === "loading") {
    return <Button variant="outline" disabled>Loading...</Button>;
  }

  if (session?.error === "RefreshAccessTokenError") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-warning">
          Your Spotify connection expired.
        </span>
        <Button size="sm" onClick={() => signIn("spotify")} className="gap-2">
          <Music className="h-4 w-4" />
          Reconnect Spotify
        </Button>
      </div>
    );
  }

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">
          Connected as {session.user?.name ?? "Spotify user"}
        </span>
        <Button variant="ghost" size="sm" onClick={() => signOut()}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button onClick={() => signIn("spotify")} className="gap-2">
      <Music className="h-4 w-4" />
      Connect Spotify
    </Button>
  );
}
