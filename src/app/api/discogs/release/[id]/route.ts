import { NextResponse } from "next/server";
import { getRelease } from "@/lib/discogs/client";
import { isInWishlist } from "@/lib/db/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const releaseId = parseInt(id, 10);

  if (!process.env.DISCOGS_TOKEN) {
    return NextResponse.json(
      { error: "DISCOGS_TOKEN not configured" },
      { status: 500 },
    );
  }

  if (isNaN(releaseId)) {
    return NextResponse.json({ error: "Invalid release ID" }, { status: 400 });
  }

  try {
    const release = await getRelease(releaseId);
    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...release,
      inWishlist: await isInWishlist(releaseId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch release" },
      { status: 500 },
    );
  }
}
