import { NextResponse } from "next/server";
import { getMarketplaceStats } from "@/lib/discogs/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const releaseId = parseInt(id, 10);

  if (isNaN(releaseId)) {
    return NextResponse.json({ error: "Invalid release ID" }, { status: 400 });
  }
  if (!process.env.DISCOGS_TOKEN) {
    return NextResponse.json(
      { error: "DISCOGS_TOKEN not configured" },
      { status: 500 },
    );
  }

  const stats = await getMarketplaceStats(releaseId);
  return NextResponse.json(stats);
}
