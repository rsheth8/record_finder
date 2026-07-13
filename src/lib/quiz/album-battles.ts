import type { ExperienceLevel, QuizAlbumPreference, QuizGenre } from "@/lib/types";

export interface AlbumBattlePair {
  id: string;
  genre: QuizGenre;
  albumA: { artist: string; title: string };
  albumB: { artist: string; title: string };
}

export const ALBUM_BATTLE_PAIRS: AlbumBattlePair[] = [
  {
    id: "rock-1",
    genre: "Rock",
    albumA: { artist: "Pink Floyd", title: "The Dark Side of the Moon" },
    albumB: { artist: "Fleetwood Mac", title: "Rumours" },
  },
  {
    id: "rock-2",
    genre: "Rock",
    albumA: { artist: "Led Zeppelin", title: "IV" },
    albumB: { artist: "The Beatles", title: "Abbey Road" },
  },
  {
    id: "indie-1",
    genre: "Indie",
    albumA: { artist: "Radiohead", title: "OK Computer" },
    albumB: { artist: "Arcade Fire", title: "Funeral" },
  },
  {
    id: "hiphop-1",
    genre: "Hip-Hop",
    albumA: { artist: "Kendrick Lamar", title: "To Pimp a Butterfly" },
    albumB: { artist: "Nas", title: "Illmatic" },
  },
  {
    id: "jazz-1",
    genre: "Jazz",
    albumA: { artist: "Miles Davis", title: "Kind of Blue" },
    albumB: { artist: "John Coltrane", title: "A Love Supreme" },
  },
  {
    id: "electronic-1",
    genre: "Electronic",
    albumA: { artist: "Daft Punk", title: "Discovery" },
    albumB: { artist: "Boards of Canada", title: "Music Has the Right to Children" },
  },
  {
    id: "soul-1",
    genre: "Soul",
    albumA: { artist: "Marvin Gaye", title: "What's Going On" },
    albumB: { artist: "Stevie Wonder", title: "Songs in the Key of Life" },
  },
  {
    id: "alternative-1",
    genre: "Alternative",
    albumA: { artist: "Nirvana", title: "Nevermind" },
    albumB: { artist: "Pixies", title: "Doolittle" },
  },
];

/** Second tier for self-identified beginners — same rationale as
 * `RECOGNIZED_ARTISTS_BEGINNER` in `recognized-artists.ts`: contemporary,
 * widely-known albums instead of the classic-rock/canon-heavy default,
 * covering the same genres as the default tier above. Also a best-effort,
 * point-in-time snapshot, not an evergreen list. */
export const ALBUM_BATTLE_PAIRS_BEGINNER: AlbumBattlePair[] = [
  {
    id: "rock-beginner-1",
    genre: "Rock",
    albumA: { artist: "Foo Fighters", title: "Wasting Light" },
    albumB: { artist: "Kings of Leon", title: "Only by the Night" },
  },
  {
    id: "indie-beginner-1",
    genre: "Indie",
    albumA: { artist: "Tame Impala", title: "Currents" },
    albumB: { artist: "Beach House", title: "Teen Dream" },
  },
  {
    id: "hiphop-beginner-1",
    genre: "Hip-Hop",
    albumA: { artist: "Drake", title: "Take Care" },
    albumB: { artist: "Travis Scott", title: "Astroworld" },
  },
  {
    id: "jazz-beginner-1",
    genre: "Jazz",
    albumA: { artist: "Kamasi Washington", title: "The Epic" },
    albumB: { artist: "Robert Glasper", title: "Black Radio" },
  },
  {
    id: "electronic-beginner-1",
    genre: "Electronic",
    albumA: { artist: "ODESZA", title: "A Moment Apart" },
    albumB: { artist: "Calvin Harris", title: "Funk Wav Bounces Vol. 1" },
  },
  {
    id: "soul-beginner-1",
    genre: "Soul",
    albumA: { artist: "Leon Bridges", title: "Coming Home" },
    albumB: { artist: "Anderson .Paak", title: "Malibu" },
  },
  {
    id: "alternative-beginner-1",
    genre: "Alternative",
    albumA: { artist: "Twenty One Pilots", title: "Blurryface" },
    albumB: { artist: "Cage the Elephant", title: "Melophobia" },
  },
];

export function pickAlbumBattles(
  genres: QuizGenre[],
  experienceLevel: ExperienceLevel = "casual",
  count = 3,
): AlbumBattlePair[] {
  const pool = experienceLevel === "new" ? ALBUM_BATTLE_PAIRS_BEGINNER : ALBUM_BATTLE_PAIRS;
  const selected = genres.length > 0 ? genres : (["Rock"] as QuizGenre[]);
  const pairs: AlbumBattlePair[] = [];
  const used = new Set<string>();

  for (const genre of selected) {
    for (const pair of pool) {
      if (pair.genre !== genre || used.has(pair.id)) continue;
      used.add(pair.id);
      pairs.push(pair);
      if (pairs.length >= count) return pairs;
    }
  }

  for (const pair of pool) {
    if (used.has(pair.id)) continue;
    used.add(pair.id);
    pairs.push(pair);
    if (pairs.length >= count) break;
  }

  return pairs;
}

export function battleToPreference(
  pair: AlbumBattlePair,
  winner: "A" | "B",
): QuizAlbumPreference {
  const winnerAlbum = winner === "A" ? pair.albumA : pair.albumB;
  const loserAlbum = winner === "A" ? pair.albumB : pair.albumA;
  return {
    winnerAlbumId: `battle:${pair.id}:${winner}`,
    loserAlbumId: `battle:${pair.id}:${winner === "A" ? "B" : "A"}`,
    winnerTitle: winnerAlbum.title,
    loserTitle: loserAlbum.title,
    winnerArtist: winnerAlbum.artist,
    loserArtist: loserAlbum.artist,
  };
}
