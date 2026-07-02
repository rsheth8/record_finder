import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getSpotifySnapshot } from "@/lib/db/queries";
import { syncSpotifyListening } from "@/lib/spotify/sync";

const CACHE_TTL_MS = 60 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.accessToken || !session.user?.id) {
    return NextResponse.json({ error: "Not connected to Spotify" }, { status: 401 });
  }

  const cached = await getSpotifySnapshot(session.user.id);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cached,
      stats: {
        savedAlbums: cached.savedAlbums.length,
        savedTracks: cached.savedTracks.length,
        recentlyPlayed: cached.recentlyPlayed.length,
      },
      cached: true,
    });
  }

  try {
    const result = await syncSpotifyListening(
      session.user.id,
      session.accessToken,
    );
    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync Spotify data" },
      { status: 500 },
    );
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.accessToken || !session.user?.id) {
    return NextResponse.json({ error: "Not connected to Spotify" }, { status: 401 });
  }

  try {
    const result = await syncSpotifyListening(
      session.user.id,
      session.accessToken,
    );
    return NextResponse.json({ ...result, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync Spotify data" },
      { status: 500 },
    );
  }
}
