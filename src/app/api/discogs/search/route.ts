import { NextRequest, NextResponse } from "next/server";
import { searchVinylRelease } from "@/lib/discogs/client";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const artist = searchParams.get("artist");
  const title = searchParams.get("title");
  const q = searchParams.get("q");

  if (!process.env.DISCOGS_TOKEN) {
    return NextResponse.json(
      { error: "DISCOGS_TOKEN not configured" },
      { status: 500 },
    );
  }

  try {
    if (artist && title) {
      const result = await searchVinylRelease(artist, title);
      return NextResponse.json({ results: result ? [result] : [] });
    }

    if (q) {
      const encoded = encodeURIComponent(q);
      const res = await fetch(
        `https://api.discogs.com/database/search?q=${encoded}&type=release&format=Vinyl&per_page=10`,
        {
          headers: {
            Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}`,
            "User-Agent": "RecordFinder/1.0",
          },
        },
      );
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Missing query params" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Discogs search failed" },
      { status: 500 },
    );
  }
}
