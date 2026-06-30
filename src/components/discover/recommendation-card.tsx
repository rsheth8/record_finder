import Image from "next/image";
import Link from "next/link";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Recommendation } from "@/lib/types";

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <Link href={`/album/${rec.discogsReleaseId}`}>
      <Card className="group flex gap-4 transition-colors hover:border-violet-600/50 hover:bg-zinc-900">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
          {rec.coverUrl ? (
            <Image
              src={rec.coverUrl}
              alt={`${rec.title} cover`}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              No art
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate group-hover:text-violet-300">
            {rec.title}
          </CardTitle>
          <CardDescription className="mt-1">
            {rec.artist}
            {rec.year ? ` · ${rec.year}` : ""}
          </CardDescription>
          <div className="mt-2 flex flex-wrap gap-1">
            {rec.genres.slice(0, 3).map((g) => (
              <Badge key={g}>{g}</Badge>
            ))}
          </div>
          {rec.reasons.length > 0 && (
            <p className="mt-2 line-clamp-2 text-xs text-zinc-500">
              {rec.reasons[0]}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}

export function RecommendationList({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardTitle>No recommendations yet</CardTitle>
        <CardDescription className="mt-2">
          Complete the quiz and connect Spotify to generate picks.
        </CardDescription>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {recommendations.map((rec) => (
        <RecommendationCard key={rec.discogsReleaseId} rec={rec} />
      ))}
    </div>
  );
}
