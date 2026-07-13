import type { ExperienceLevel, QuizGenre } from "@/lib/types";

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

/** Second tier for self-identified beginners ("just getting into vinyl") —
 * skews toward contemporary, mainstream-crossover acts instead of the
 * classic-rock/canon-heavy default above, since a newer or younger listener
 * is far more likely to actually recognize these. This is a best-effort,
 * point-in-time snapshot of "widely known right now," not an evergreen
 * list — worth revisiting periodically as tastes shift. */
export const RECOGNIZED_ARTISTS_BEGINNER: Record<QuizGenre, string[]> = {
  Rock: ["Foo Fighters", "Greta Van Fleet"],
  Alternative: ["Twenty One Pilots", "Cage the Elephant"],
  Indie: ["Boygenius", "Beabadoobee"],
  "Hip-Hop": ["Drake", "Travis Scott"],
  "R&B": ["SZA", "The Weeknd"],
  Jazz: ["Kamasi Washington", "Robert Glasper"],
  Soul: ["Leon Bridges", "Anderson .Paak"],
  Funk: ["Bruno Mars", "Vulfpeck"],
  Electronic: ["Calvin Harris", "ODESZA"],
  Pop: ["Taylor Swift", "Dua Lipa"],
  Punk: ["Green Day", "IDLES"],
  Metal: ["Ghost", "Sleep Token"],
  Folk: ["Fleet Foxes", "Noah Kahan"],
  Country: ["Chris Stapleton", "Kacey Musgraves"],
  Blues: ["Gary Clark Jr.", "Christone \"Kingfish\" Ingram"],
  Classical: ["Ludovico Einaudi", "Max Richter"],
  Reggae: ["Chronixx", "Protoje"],
  Latin: ["Bad Bunny", "Rosalía"],
};

/** Selects a bounded, deduplicated pool of artists to show in the grid —
 * favors the user's chosen genres (same fallback-to-Rock pattern as
 * `pickAlbumBattles`), then tops up from the rest so the grid always has a
 * reasonable number of options even for a single-genre quiz taker.
 * `experienceLevel === "new"` draws from the beginner-friendly tier instead
 * of the classic/canon-skewing default. */
export function pickRecognizedArtists(
  genres: QuizGenre[],
  experienceLevel: ExperienceLevel = "casual",
  cap = 12,
): string[] {
  const pool = experienceLevel === "new" ? RECOGNIZED_ARTISTS_BEGINNER : RECOGNIZED_ARTISTS;
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
    if (addAll(pool[genre] ?? [])) return artists;
  }
  for (const list of Object.values(pool)) {
    if (addAll(list)) return artists;
  }
  return artists;
}
