import { desc, eq } from "drizzle-orm";
import { tasteProfile, spotifySnapshot, wishlistItems, recommendationCache } from "../../../drizzle/schema";
import { db } from "./index";
import { parseJson } from "@/lib/utils";
import type {
  TasteProfileData,
  SpotifyArtist,
  SpotifyAlbum,
  WishlistItem,
  Recommendation,
  AlbumPreference,
  QuizGenre,
  QuizDecade,
  QuizMood,
} from "@/lib/types";

export function getTasteProfile(): TasteProfileData | null {
  const row = db.select().from(tasteProfile).orderBy(desc(tasteProfile.id)).get();
  if (!row) return null;

  return {
    genres: parseJson<QuizGenre[]>(row.genres, []),
    decades: parseJson<QuizDecade[]>(row.decades, []),
    moods: parseJson<QuizMood[]>(row.moods, []),
    albumPreference: row.albumPreference as AlbumPreference,
    deepCutLevel: row.deepCutLevel,
    completedAt: row.completedAt,
  };
}

export function saveTasteProfile(data: Omit<TasteProfileData, "completedAt"> & { completed?: boolean }) {
  const existing = db.select().from(tasteProfile).orderBy(desc(tasteProfile.id)).get();
  const now = new Date();

  const values = {
    genres: JSON.stringify(data.genres),
    decades: JSON.stringify(data.decades),
    moods: JSON.stringify(data.moods),
    albumPreference: data.albumPreference,
    deepCutLevel: data.deepCutLevel,
    completedAt: data.completed ? now : existing?.completedAt ?? null,
    updatedAt: now,
  };

  if (existing) {
    db.update(tasteProfile).set(values).where(eq(tasteProfile.id, existing.id)).run();
  } else {
    db.insert(tasteProfile).values(values).run();
  }
}

export function getSpotifySnapshot(): {
  topArtists: SpotifyArtist[];
  topAlbums: SpotifyAlbum[];
  topGenres: string[];
  fetchedAt: Date;
} | null {
  const row = db.select().from(spotifySnapshot).orderBy(desc(spotifySnapshot.id)).get();
  if (!row) return null;

  return {
    topArtists: parseJson<SpotifyArtist[]>(row.topArtists, []),
    topAlbums: parseJson<SpotifyAlbum[]>(row.topAlbums, []),
    topGenres: parseJson<string[]>(row.topGenres, []),
    fetchedAt: row.fetchedAt,
  };
}

export function saveSpotifySnapshot(data: {
  topArtists: SpotifyArtist[];
  topAlbums: SpotifyAlbum[];
  topGenres: string[];
}) {
  db.insert(spotifySnapshot)
    .values({
      topArtists: JSON.stringify(data.topArtists),
      topAlbums: JSON.stringify(data.topAlbums),
      topGenres: JSON.stringify(data.topGenres),
      fetchedAt: new Date(),
    })
    .run();
}

export function getWishlist(): WishlistItem[] {
  const rows = db
    .select()
    .from(wishlistItems)
    .orderBy(desc(wishlistItems.addedAt))
    .all();

  return rows.map((r) => ({
    id: r.id,
    discogsReleaseId: r.discogsReleaseId,
    title: r.title,
    artist: r.artist,
    coverUrl: r.coverUrl,
    year: r.year,
    notes: r.notes ?? "",
    addedAt: r.addedAt,
  }));
}

export function addToWishlist(item: Omit<WishlistItem, "id" | "addedAt">) {
  db.insert(wishlistItems)
    .values({
      discogsReleaseId: item.discogsReleaseId,
      title: item.title,
      artist: item.artist,
      coverUrl: item.coverUrl,
      year: item.year,
      notes: item.notes,
      addedAt: new Date(),
    })
    .onConflictDoNothing()
    .run();
}

export function removeFromWishlist(discogsReleaseId: number) {
  db.delete(wishlistItems)
    .where(eq(wishlistItems.discogsReleaseId, discogsReleaseId))
    .run();
}

export function isInWishlist(discogsReleaseId: number): boolean {
  const row = db
    .select()
    .from(wishlistItems)
    .where(eq(wishlistItems.discogsReleaseId, discogsReleaseId))
    .get();
  return !!row;
}

export function getCachedRecommendations(): Recommendation[] | null {
  const row = db
    .select()
    .from(recommendationCache)
    .orderBy(desc(recommendationCache.id))
    .get();

  if (!row || row.expiresAt < new Date()) return null;
  return parseJson<Recommendation[]>(row.results, []);
}

export function clearRecommendationCache() {
  db.delete(recommendationCache).run();
}

export function cacheRecommendations(results: Recommendation[]) {
  clearRecommendationCache();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  db.insert(recommendationCache)
    .values({
      results: JSON.stringify(results),
      expiresAt,
      createdAt: now,
    })
    .run();
}
