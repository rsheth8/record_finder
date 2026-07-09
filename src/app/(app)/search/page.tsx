import { SearchFeed } from "@/components/search/search-feed";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Search
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Look up any artist or album on vinyl — real Discogs pressings, priced and rated.
        </p>
      </div>
      <SearchFeed initialQuery={q ?? ""} />
    </div>
  );
}
