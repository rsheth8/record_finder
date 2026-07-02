import { and, desc, eq, sql } from "drizzle-orm";
import {
  tasteProfile,
  spotifySnapshot,
  wishlistItems,
  recommendationCache,
  users,
  creditLedger,
  orders,
} from "../../../drizzle/schema";
import { db, ensureDb } from "./index";
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

export async function getTasteProfileFromDb(
  userId: string,
): Promise<TasteProfileData | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(tasteProfile)
    .where(eq(tasteProfile.userId, userId))
    .get();
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

export async function saveTasteProfileToDb(
  userId: string,
  data: Omit<TasteProfileData, "completedAt"> & { completed?: boolean },
) {
  await ensureDb();
  const existing = await db
    .select()
    .from(tasteProfile)
    .where(eq(tasteProfile.userId, userId))
    .get();
  const now = new Date();

  const values = {
    userId,
    genres: JSON.stringify(data.genres),
    decades: JSON.stringify(data.decades),
    moods: JSON.stringify(data.moods),
    albumPreference: data.albumPreference,
    deepCutLevel: data.deepCutLevel,
    completedAt: data.completed ? now : existing?.completedAt ?? null,
    updatedAt: now,
  };

  await db
    .insert(tasteProfile)
    .values(values)
    .onConflictDoUpdate({ target: tasteProfile.userId, set: values });
}

export async function getSpotifySnapshot(userId: string): Promise<{
  topArtists: SpotifyArtist[];
  topAlbums: SpotifyAlbum[];
  topGenres: string[];
  fetchedAt: Date;
} | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(spotifySnapshot)
    .where(eq(spotifySnapshot.userId, userId))
    .get();
  if (!row) return null;

  return {
    topArtists: parseJson<SpotifyArtist[]>(row.topArtists, []),
    topAlbums: parseJson<SpotifyAlbum[]>(row.topAlbums, []),
    topGenres: parseJson<string[]>(row.topGenres, []),
    fetchedAt: row.fetchedAt,
  };
}

export async function saveSpotifySnapshot(
  userId: string,
  data: {
    topArtists: SpotifyArtist[];
    topAlbums: SpotifyAlbum[];
    topGenres: string[];
  },
) {
  await ensureDb();
  const values = {
    userId,
    topArtists: JSON.stringify(data.topArtists),
    topAlbums: JSON.stringify(data.topAlbums),
    topGenres: JSON.stringify(data.topGenres),
    fetchedAt: new Date(),
  };
  await db
    .insert(spotifySnapshot)
    .values(values)
    .onConflictDoUpdate({ target: spotifySnapshot.userId, set: values });
}

export async function getWishlist(userId: string): Promise<WishlistItem[]> {
  await ensureDb();
  const rows = await db
    .select()
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId))
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

export async function addToWishlist(
  userId: string,
  item: Omit<WishlistItem, "id" | "addedAt">,
) {
  await ensureDb();
  await db
    .insert(wishlistItems)
    .values({
      userId,
      discogsReleaseId: item.discogsReleaseId,
      title: item.title,
      artist: item.artist,
      coverUrl: item.coverUrl,
      year: item.year,
      notes: item.notes,
      addedAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function removeFromWishlist(
  userId: string,
  discogsReleaseId: number,
) {
  await ensureDb();
  await db
    .delete(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, userId),
        eq(wishlistItems.discogsReleaseId, discogsReleaseId),
      ),
    );
}

export async function isInWishlist(
  userId: string,
  discogsReleaseId: number,
): Promise<boolean> {
  await ensureDb();
  const row = await db
    .select()
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, userId),
        eq(wishlistItems.discogsReleaseId, discogsReleaseId),
      ),
    )
    .get();
  return !!row;
}

export async function getCachedRecommendations(
  userId: string,
): Promise<Recommendation[] | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(recommendationCache)
    .where(eq(recommendationCache.userId, userId))
    .get();

  if (!row || row.expiresAt < new Date()) return null;
  return parseJson<Recommendation[]>(row.results, []);
}

export async function clearRecommendationCache(userId: string) {
  await ensureDb();
  await db
    .delete(recommendationCache)
    .where(eq(recommendationCache.userId, userId));
}

export async function cacheRecommendations(
  userId: string,
  results: Recommendation[],
) {
  await ensureDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  const values = {
    userId,
    results: JSON.stringify(results),
    expiresAt,
    createdAt: now,
  };

  await db
    .insert(recommendationCache)
    .values(values)
    .onConflictDoUpdate({ target: recommendationCache.userId, set: values });
}

export async function ensureUser(userId: string, email?: string | null) {
  await ensureDb();
  const existing = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!existing) {
    await db.insert(users).values({
      id: userId,
      email: email ?? null,
      createdAt: new Date(),
    });
  }
}

export async function getCreditBalance(userId: string): Promise<number> {
  await ensureDb();
  const result = await db
    .select({ total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .get();
  return result?.total ?? 0;
}

export async function addCreditEntry(params: {
  userId: string;
  delta: number;
  reason: string;
}) {
  await ensureDb();
  await db.insert(creditLedger).values({
    userId: params.userId,
    delta: params.delta,
    reason: params.reason,
    createdAt: new Date(),
  });
}

export async function getCreditHistory(userId: string) {
  await ensureDb();
  return db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .all();
}

/** A reservation: credits spent to hold a concierge queue spot for a Discogs
 * listing. There is no payment lifecycle — the buyer completes the purchase
 * on Discogs themselves. */
export type ReservationRecord = {
  id: number;
  userId: string;
  discogsReleaseId: number;
  title: string;
  artist: string;
  creditsSpent: number;
  discogsUrl: string;
  createdAt: Date;
};

export async function createReservation(params: {
  userId: string;
  discogsReleaseId: number;
  title: string;
  artist: string;
  creditsSpent: number;
  discogsUrl: string;
}): Promise<ReservationRecord> {
  await ensureDb();
  const createdAt = new Date();
  const result = await db
    .insert(orders)
    .values({
      userId: params.userId,
      discogsReleaseId: params.discogsReleaseId,
      title: params.title,
      artist: params.artist,
      creditsSpent: params.creditsSpent,
      discogsUrl: params.discogsUrl,
      createdAt,
    })
    .returning();

  if (result[0]) return result[0] as ReservationRecord;

  const row = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, params.userId))
    .orderBy(desc(orders.id))
    .get();

  return row as ReservationRecord;
}

export async function getReservation(
  reservationId: number,
  userId: string,
): Promise<ReservationRecord | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(orders)
    .where(eq(orders.id, reservationId))
    .get();
  if (!row || row.userId !== userId) return null;
  return row as ReservationRecord;
}

export async function getUserReservations(
  userId: string,
): Promise<ReservationRecord[]> {
  await ensureDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .all();
  return rows as ReservationRecord[];
}
