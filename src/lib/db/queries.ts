import { desc, eq, sql } from "drizzle-orm";
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

export async function getTasteProfileFromDb(): Promise<TasteProfileData | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(tasteProfile)
    .orderBy(desc(tasteProfile.id))
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
  data: Omit<TasteProfileData, "completedAt"> & { completed?: boolean },
) {
  await ensureDb();
  const existing = await db
    .select()
    .from(tasteProfile)
    .orderBy(desc(tasteProfile.id))
    .get();
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
    await db
      .update(tasteProfile)
      .set(values)
      .where(eq(tasteProfile.id, existing.id));
  } else {
    await db.insert(tasteProfile).values(values);
  }
}

export async function getSpotifySnapshot(): Promise<{
  topArtists: SpotifyArtist[];
  topAlbums: SpotifyAlbum[];
  topGenres: string[];
  fetchedAt: Date;
} | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(spotifySnapshot)
    .orderBy(desc(spotifySnapshot.id))
    .get();
  if (!row) return null;

  return {
    topArtists: parseJson<SpotifyArtist[]>(row.topArtists, []),
    topAlbums: parseJson<SpotifyAlbum[]>(row.topAlbums, []),
    topGenres: parseJson<string[]>(row.topGenres, []),
    fetchedAt: row.fetchedAt,
  };
}

export async function saveSpotifySnapshot(data: {
  topArtists: SpotifyArtist[];
  topAlbums: SpotifyAlbum[];
  topGenres: string[];
}) {
  await ensureDb();
  await db.insert(spotifySnapshot).values({
    topArtists: JSON.stringify(data.topArtists),
    topAlbums: JSON.stringify(data.topAlbums),
    topGenres: JSON.stringify(data.topGenres),
    fetchedAt: new Date(),
  });
}

export async function getWishlist(): Promise<WishlistItem[]> {
  await ensureDb();
  const rows = await db
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

export async function addToWishlist(
  item: Omit<WishlistItem, "id" | "addedAt">,
) {
  await ensureDb();
  await db
    .insert(wishlistItems)
    .values({
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

export async function removeFromWishlist(discogsReleaseId: number) {
  await ensureDb();
  await db
    .delete(wishlistItems)
    .where(eq(wishlistItems.discogsReleaseId, discogsReleaseId));
}

export async function isInWishlist(discogsReleaseId: number): Promise<boolean> {
  await ensureDb();
  const row = await db
    .select()
    .from(wishlistItems)
    .where(eq(wishlistItems.discogsReleaseId, discogsReleaseId))
    .get();
  return !!row;
}

export async function getCachedRecommendations(): Promise<Recommendation[] | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(recommendationCache)
    .orderBy(desc(recommendationCache.id))
    .get();

  if (!row || row.expiresAt < new Date()) return null;
  return parseJson<Recommendation[]>(row.results, []);
}

export async function clearRecommendationCache() {
  await ensureDb();
  await db.delete(recommendationCache);
}

export async function cacheRecommendations(results: Recommendation[]) {
  await clearRecommendationCache();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  await db.insert(recommendationCache).values({
    results: JSON.stringify(results),
    expiresAt,
    createdAt: now,
  });
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
  stripeSessionId?: string;
}) {
  await ensureDb();
  if (params.stripeSessionId) {
    const existing = await db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.stripeSessionId, params.stripeSessionId))
      .get();
    if (existing) return;
  }
  await db.insert(creditLedger).values({
    userId: params.userId,
    delta: params.delta,
    reason: params.reason,
    stripeSessionId: params.stripeSessionId ?? null,
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

export type OrderRecord = {
  id: number;
  userId: string;
  discogsReleaseId: number;
  title: string;
  artist: string;
  creditsSpent: number;
  status: string;
  discogsUrl: string;
  createdAt: Date;
};

export async function createOrder(params: {
  userId: string;
  discogsReleaseId: number;
  title: string;
  artist: string;
  creditsSpent: number;
  discogsUrl: string;
}): Promise<OrderRecord> {
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
      status: "reserved",
      discogsUrl: params.discogsUrl,
      createdAt,
    })
    .returning();

  if (result[0]) return result[0] as OrderRecord;

  const row = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, params.userId))
    .orderBy(desc(orders.id))
    .get();

  return row as OrderRecord;
}

export async function getOrder(
  orderId: number,
  userId: string,
): Promise<OrderRecord | null> {
  await ensureDb();
  const row = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .get();
  if (!row || row.userId !== userId) return null;
  return row as OrderRecord;
}

export async function getUserOrders(userId: string): Promise<OrderRecord[]> {
  await ensureDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .all();
  return rows as OrderRecord[];
}
