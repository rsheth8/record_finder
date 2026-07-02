import { z } from "zod";

export const addWishlistSchema = z.object({
  discogsReleaseId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  artist: z.string().min(1).max(500),
  coverUrl: z.string().url().nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  notes: z.string().max(2000).optional(),
});
