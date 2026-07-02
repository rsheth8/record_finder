import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from "@/lib/db/queries";
import { addWishlistSchema } from "@/lib/validation/wishlist";

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
