import type { QuizGenre } from "@/lib/types";

/** Curated, widely-recognizable artists per genre for the quiz's artist
 * recognition grid — same hand-curated approach as `album-battles.ts`.
 * Picking obscure artists here would make "own on vinyl / seen live" mostly
 * come back empty, which defeats the point of the signal. */
export const RECOGNIZED_ARTISTS: Record<QuizGenre, string[]> = {
  Rock: ["Led Zeppelin", "The Rolling Stones", "Fleetwood Mac"],
  Alternative: ["Nirvana", "Radiohead", "The Pixies"],
  Indie: ["Arcade Fire", "Vampire Weekend", "Tame Impala"],
  "Hip-Hop": ["Kendrick Lamar", "Nas", "A Tribe Called Quest"],
  "R&B": ["Frank Ocean", "Erykah Badu", "D'Angelo"],
  Jazz: ["Miles Davis", "John Coltrane", "Herbie Hancock"],
  Soul: ["Marvin Gaye", "Stevie Wonder", "Aretha Franklin"],
  Funk: ["Parliament", "Sly and the Family Stone", "James Brown"],
  Electronic: ["Daft Punk", "Boards of Canada", "Aphex Twin"],
  Pop: ["Michael Jackson", "Madonna", "ABBA"],
  Punk: ["The Clash", "Ramones", "Sex Pistols"],
  Metal: ["Black Sabbath", "Metallica", "Iron Maiden"],
  Folk: ["Bob Dylan", "Joni Mitchell", "Nick Drake"],
  Country: ["Johnny Cash", "Dolly Parton", "Willie Nelson"],
  Blues: ["B.B. King", "Muddy Waters", "Etta James"],
  Classical: ["Ludwig van Beethoven", "Wolfgang Amadeus Mozart", "Claude Debussy"],
  Reggae: ["Bob Marley", "Peter Tosh", "Toots and the Maytals"],
  Latin: ["Celia Cruz", "Buena Vista Social Club", "Rubén Blades"],
};

/** Selects a bounded, deduplicated pool of artists to show in the grid —
 * favors the user's chosen genres (same fallback-to-Rock pattern as
 * `pickAlbumBattles`), then tops up from the rest so the grid always has a
 * reasonable number of options even for a single-genre quiz taker. */
export function pickRecognizedArtists(genres: QuizGenre[], cap = 12): string[] {
  const selected = genres.length > 0 ? genres : (["Rock"] as QuizGenre[]);
  const artists: string[] = [];
  const seen = new Set<string>();

  function addAll(list: string[]) {
    for (const artist of list) {
      if (seen.has(artist)) continue;
      seen.add(artist);
      artists.push(artist);
      if (artists.length >= cap) return true;
    }
    return false;
  }

  for (const genre of selected) {
    if (addAll(RECOGNIZED_ARTISTS[genre] ?? [])) return artists;
  }
  for (const list of Object.values(RECOGNIZED_ARTISTS)) {
    if (addAll(list)) return artists;
  }
  return artists;
}
