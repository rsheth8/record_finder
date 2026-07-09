import type { QuizGenre } from "@/lib/types";

/**
 * Maps this app's quiz genre vocabulary to Discogs' actual search API fields.
 * Discogs' `/database/search` has two separate filterable fields — `genre`
 * (a fixed, small top-level taxonomy of ~15 tags: Rock, Jazz, Funk / Soul,
 * Folk World & Country, etc.) and `style` (a much larger, more specific
 * sub-genre taxonomy: Alternative Rock, Indie Rock, Punk, Heavy Metal,
 * Rhythm & Blues, ...). Several QUIZ_GENRES values (Alternative, Indie,
 * Punk, Metal, R&B) don't exist in Discogs' genre taxonomy at all — sending
 * them as `genre=` silently returns zero results. Verified live against the
 * real API (not assumed from docs): each entry below was confirmed to
 * return real, correctly-filtered results before being added here.
 */
export const GENRE_DISCOGS_PARAM: Record<
  QuizGenre,
  { field: "genre" | "style"; value: string }
> = {
  Rock: { field: "genre", value: "Rock" },
  Alternative: { field: "style", value: "Alternative Rock" },
  Indie: { field: "style", value: "Indie Rock" },
  "Hip-Hop": { field: "genre", value: "Hip Hop" },
  "R&B": { field: "style", value: "Rhythm & Blues" },
  Jazz: { field: "genre", value: "Jazz" },
  Soul: { field: "genre", value: "Soul" },
  Funk: { field: "genre", value: "Funk" },
  Electronic: { field: "genre", value: "Electronic" },
  Pop: { field: "genre", value: "Pop" },
  Punk: { field: "style", value: "Punk" },
  Metal: { field: "style", value: "Heavy Metal" },
  Folk: { field: "genre", value: "Folk" },
  Country: { field: "genre", value: "Country" },
  Blues: { field: "genre", value: "Blues" },
  Classical: { field: "genre", value: "Classical" },
  Reggae: { field: "genre", value: "Reggae" },
  Latin: { field: "genre", value: "Latin" },
};
