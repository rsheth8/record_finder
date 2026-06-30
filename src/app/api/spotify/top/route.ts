import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  fetchTopArtists,
  fetchTopAlbums,
  deriveTopGenres,
} from "@/lib/spotify/client";
import {
  getSpotifySnapshot,
  saveSpotifySnapshot,
} from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not connected to Spotify" }, { status: 401 });
  }

  const cached = getSpotifySnapshot();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  if (cached && cached.fetchedAt.getTime() > oneHourAgo) {
    return NextResponse.json(cached);
  }

  try {
    const [topArtists, topAlbums] = await Promise.all([
      fetchTopArtists(session.accessToken),
      fetchTopAlbums(session.accessToken),
    ]);
    const topGenres = deriveTopGenres(topArtists);

    const snapshot = { topArtists, topAlbums, topGenres, fetchedAt: new Date() };
    saveSpotifySnapshot({ topArtists, topAlbums, topGenres });

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Spotify data" },
      { status: 500 },
    );
  }
}
