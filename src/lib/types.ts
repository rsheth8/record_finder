export const QUIZ_GENRES = [
  "Rock",
  "Alternative",
  "Indie",
  "Hip-Hop",
  "R&B",
  "Jazz",
  "Soul",
  "Funk",
  "Electronic",
  "Pop",
  "Punk",
  "Metal",
  "Folk",
  "Country",
  "Blues",
  "Classical",
  "Reggae",
  "Latin",
] as const;

export const QUIZ_DECADES = [
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
] as const;

export const QUIZ_MOODS = [
  "Chill",
  "Energetic",
  "Melancholy",
  "Uplifting",
  "Dark",
  "Dreamy",
  "Groovy",
  "Raw",
] as const;

export type QuizGenre = (typeof QUIZ_GENRES)[number];
export type QuizDecade = (typeof QUIZ_DECADES)[number];
export type QuizMood = (typeof QUIZ_MOODS)[number];
export type AlbumPreference = "singles" | "balanced" | "full_albums";

export interface TasteProfileData {
  genres: QuizGenre[];
  decades: QuizDecade[];
  moods: QuizMood[];
  albumPreference: AlbumPreference;
  deepCutLevel: number;
  completedAt: Date | null;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artist: string;
  artistId: string;
  releaseDate: string;
  imageUrl: string | null;
  spotifyUrl: string;
}

export interface Recommendation {
  discogsReleaseId: number;
  title: string;
  artist: string;
  year: number | null;
  coverUrl: string | null;
  genres: string[];
  communityRating: number | null;
  ratingCount: number | null;
  spotifyAlbumId: string | null;
  spotifyUrl: string | null;
  score: number;
  reasons: string[];
}

export interface DiscogsRelease {
  id: number;
  title: string;
  artist: string;
  year: number | null;
  coverUrl: string | null;
  genres: string[];
  styles: string[];
  formats: string[];
  tracklist: { position: string; title: string; duration: string }[];
  communityRating: number | null;
  ratingCount: number | null;
  spotifyUrl: string | null;
  marketplace?: {
    lowestPrice: number | null;
    currency: string;
    numForSale: number;
    discogsUrl: string;
  };
}

export interface WishlistItem {
  id: number;
  discogsReleaseId: number;
  title: string;
  artist: string;
  coverUrl: string | null;
  year: number | null;
  notes: string;
  addedAt: Date;
}
