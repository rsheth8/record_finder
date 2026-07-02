import type { QuizGenre } from "@/lib/types";

export const QUIZ_SUB_GENRES: Record<QuizGenre, readonly string[]> = {
  Rock: ["Classic Rock", "Prog Rock", "Psychedelic", "Hard Rock", "Southern Rock"],
  Alternative: ["Grunge", "Post-Punk", "Britpop", "Shoegaze", "Art Rock"],
  Indie: ["Indie Rock", "Indie Pop", "Lo-Fi", "Math Rock", "Chamber Pop"],
  "Hip-Hop": ["East Coast", "West Coast", "Conscious", "Experimental", "Boom Bap"],
  "R&B": ["Neo Soul", "Quiet Storm", "Contemporary R&B", "Funk-Soul", "Motown"],
  Jazz: ["Bebop", "Cool Jazz", "Fusion", "Free Jazz", "Modal Jazz"],
  Soul: ["Northern Soul", "Southern Soul", "Blue-Eyed Soul", "Psychedelic Soul"],
  Funk: ["P-Funk", "Jazz-Funk", "Go-Go", "Boogie"],
  Electronic: ["House", "Techno", "Ambient", "Downtempo", "IDM"],
  Pop: ["Synth Pop", "Art Pop", "Dance Pop", "Indie Pop"],
  Punk: ["Hardcore", "Post-Punk", "Pop Punk", "Garage Punk"],
  Metal: ["Heavy Metal", "Thrash", "Doom", "Black Metal", "Progressive Metal"],
  Folk: ["Singer-Songwriter", "Americana", "Folk Rock", "Celtic"],
  Country: ["Outlaw Country", "Alt-Country", "Classic Country", "Honky Tonk"],
  Blues: ["Delta Blues", "Chicago Blues", "Electric Blues", "Blues Rock"],
  Classical: ["Baroque", "Romantic", "Minimalism", "Contemporary Classical"],
  Reggae: ["Roots Reggae", "Dub", "Dancehall", "Ska"],
  Latin: ["Salsa", "Bossa Nova", "Latin Jazz", "Cumbia"],
};
