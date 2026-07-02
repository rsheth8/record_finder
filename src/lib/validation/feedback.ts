import { z } from "zod";

export const feedbackSchema = z.object({
  discogsReleaseId: z.number().int().positive(),
  artist: z.string().min(1).max(500),
  signal: z.enum(["like", "dislike", "own", "hide"]),
});
