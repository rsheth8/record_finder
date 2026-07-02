import { z } from "zod";

export const createOrderSchema = z.object({
  discogsReleaseId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  artist: z.string().min(1).max(500),
  creditsSpent: z.number().int().positive().optional(),
});
