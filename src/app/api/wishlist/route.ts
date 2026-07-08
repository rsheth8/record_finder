import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  setWishlistPriceAtAdd,
} from "@/lib/db/queries";
import { addWishlistSchema } from "@/lib/validation/wishlist";
import { getMarketplaceStats } from "@/lib/discogs/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  return NextResponse.json(await getWishlist(session.user.id));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const parsed = addWishlistSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  await addToWishlist(session.user.id, {
    discogsReleaseId: body.discogsReleaseId,
    title: body.title,
    artist: body.artist,
    coverUrl: body.coverUrl ?? null,
    year: body.year ?? null,
    notes: body.notes ?? "",
  });

  // Bootstraps price history immediately on add rather than waiting for the
  // next cron cycle, and gives price-drop alerts a baseline to compare
  // against. getMarketplaceStats() never throws (falls back to nulls
  // internally), so a Discogs hiccup here never breaks adding to wishlist.
  const stats = await getMarketplaceStats(body.discogsReleaseId);
  await setWishlistPriceAtAdd(session.user.id, body.discogsReleaseId, stats?.lowestPrice ?? null);

  return NextResponse.json(await getWishlist(session.user.id));
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("discogsReleaseId");

  if (!id) {
    return NextResponse.json({ error: "Missing discogsReleaseId" }, { status: 400 });
  }

  await removeFromWishlist(session.user.id, parseInt(id, 10));
  return NextResponse.json(await getWishlist(session.user.id));
}
