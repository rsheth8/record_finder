export type SourceName =
  | "spotify"
  | "discogs"
  | "musicbrainz"
  | "lastfm"
  | "apple-music"
  | "db";

export interface SourceError {
  source: SourceName;
  message: string;
  recoverable: boolean;
}

export function toSourceError(
  source: SourceName,
  error: unknown,
  recoverable = true,
): SourceError {
  return {
    source,
    message: error instanceof Error ? error.message : String(error),
    recoverable,
  };
}

export const SOURCE_LABELS: Record<SourceName, string> = {
  spotify: "Spotify",
  discogs: "Discogs",
  musicbrainz: "MusicBrainz",
  lastfm: "Last.fm",
  "apple-music": "Apple Music",
  db: "Database",
};
