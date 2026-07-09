import Link from "next/link";
import { getMasterVersions } from "@/lib/discogs/client";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

/** Async Server Component rendered inside a `<Suspense>` boundary (see
 * AlbumDetail) so it streams in independently of the main album content —
 * same reasoning as `SimilarReleases`. Lists every pressing/reissue/regional
 * variant of this album (via `/masters/{id}/versions`, one call total) so
 * collectors can see which pressing is actually worth chasing before buying
 * whichever one happened to show up first. Each row links to its own album
 * page for full pressing detail on demand — no new detail view needed. */
export async function ComparePressings({
  masterId,
  currentReleaseId,
}: {
  masterId: number;
  currentReleaseId: number;
}) {
  const versions = await getMasterVersions(masterId);
  if (versions.length <= 1) return null;

  return (
    <Card className="stream-fade-in">
      <CardTitle>Compare pressings</CardTitle>
      <CardDescription className="mt-1">
        Other pressings of this album, most-wanted first
      </CardDescription>
      <ul className="mt-4 divide-y divide-border-subtle">
        {versions.map((v) => {
          const isCurrent = v.id === currentReleaseId;
          const row = (
            <div
              className={`flex items-center justify-between gap-3 py-2.5 text-sm ${
                isCurrent ? "text-muted" : "text-foreground"
              }`}
            >
              <span className="min-w-0 flex-1 truncate">
                {v.released ? `${v.released} · ` : ""}
                {v.country ?? "Unknown"}
                {v.format ? ` · ${v.format}` : ""}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {v.inWantlist != null && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Users className="h-3 w-3" />
                    {v.inWantlist.toLocaleString()}
                  </span>
                )}
                {isCurrent && <Badge variant="accent">This pressing</Badge>}
              </span>
            </div>
          );

          return (
            <li key={v.id}>
              {isCurrent ? (
                row
              ) : (
                <Link href={`/album/${v.id}`} className="focus-ring block rounded-sm transition-colors hover:text-accent">
                  {row}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
