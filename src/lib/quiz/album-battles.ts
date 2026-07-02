import type { QuizAlbumPreference, QuizGenre } from "@/lib/types";

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

export function pickAlbumBattles(genres: QuizGenre[], count = 3): AlbumBattlePair[] {
  const selected = genres.length > 0 ? genres : (["Rock"] as QuizGenre[]);
  const pairs: AlbumBattlePair[] = [];
  const used = new Set<string>();

  for (const genre of selected) {
    for (const pair of ALBUM_BATTLE_PAIRS) {
      if (pair.genre !== genre || used.has(pair.id)) continue;
      used.add(pair.id);
      pairs.push(pair);
      if (pairs.length >= count) return pairs;
    }
  }

  for (const pair of ALBUM_BATTLE_PAIRS) {
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
