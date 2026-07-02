import { z } from "zod";
import { QUIZ_GENRES, QUIZ_DECADES, QUIZ_MOODS } from "@/lib/types";

const albumPreferenceSchema = z.object({
  winnerAlbumId: z.string(),
  loserAlbumId: z.string(),
  winnerTitle: z.string(),
  loserTitle: z.string(),
  winnerArtist: z.string().optional(),
  loserArtist: z.string().optional(),
});

export const saveQuizSchema = z.object({
  genres: z.array(z.enum(QUIZ_GENRES)).max(6).default([]),
  decades: z.array(z.enum(QUIZ_DECADES)).max(4).default([]),
  moods: z.array(z.enum(QUIZ_MOODS)).max(4).default([]),
  albumPreference: z
    .enum(["singles", "balanced", "full_albums"])
    .default("balanced"),
  deepCutLevel: z.number().min(0).max(100).default(50),
  subGenres: z.record(z.string(), z.array(z.string())).default({}),
  albumPreferences: z.array(albumPreferenceSchema).default([]),
  completed: z.boolean().default(false),
});
