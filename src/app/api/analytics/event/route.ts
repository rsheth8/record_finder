import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logEvent } from "@/lib/db/queries";
import { getOrCreateUserId } from "@/lib/identity";
import { CLIENT_LOGGABLE_EVENT_TYPES } from "@/lib/analytics/types";

const bodySchema = z.object({
  type: z.enum(CLIENT_LOGGABLE_EVENT_TYPES as [string, ...string[]]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** Client-side analytics beacon. Only accepts the fixed
 * `CLIENT_LOGGABLE_EVENT_TYPES` allowlist — everything else (feedback,
 * reservations, generation, sync) is logged server-side from the route that
 * already has trustworthy context, so a client can't forge those events. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const userId = await getOrCreateUserId();
  await logEvent(userId, parsed.data.type, parsed.data.metadata);

  return NextResponse.json({ ok: true });
}
