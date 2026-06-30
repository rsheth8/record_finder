import { NextRequest, NextResponse } from "next/server";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from "@/lib/db/queries";

export async function GET() {
  return NextResponse.json(await getWishlist());
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.discogsReleaseId || !body.title || !body.artist) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await addToWishlist({
    discogsReleaseId: body.discogsReleaseId,
    title: body.title,
    artist: body.artist,
    coverUrl: body.coverUrl ?? null,
    year: body.year ?? null,
    notes: body.notes ?? "",
  });

  return NextResponse.json(await getWishlist());
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("discogsReleaseId");

  if (!id) {
    return NextResponse.json({ error: "Missing discogsReleaseId" }, { status: 400 });
  }

  await removeFromWishlist(parseInt(id, 10));
  return NextResponse.json(await getWishlist());
}
