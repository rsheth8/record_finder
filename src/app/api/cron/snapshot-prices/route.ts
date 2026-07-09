import { NextRequest, NextResponse } from "next/server";
import { getMarketplaceStats } from "@/lib/discogs/client";
import {
  getReleaseIdsNeedingSnapshot,
  insertPriceSnapshot,
  getWishlistAlertCandidates,
  markWishlistAlerted,
} from "@/lib/db/queries";
import { findPriceDropAlerts, groupAlertsByUser } from "@/lib/commerce/price-alerts";
import { buildPriceDropEmail } from "@/lib/email/price-drop-alert";
import { sendEmail } from "@/lib/email/send";

// One Discogs call per release, serialized through the shared 1-req/sec
// throttle — 100 releases costs ~100s. Matches the /api/recommendations (60)
// and /api/discogs/search (30) precedent, scaled up for this larger batch.
export const maxDuration = 120;

const SNAPSHOT_BATCH_SIZE = 100;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set — refusing to run an unguarded price-snapshot job." },
      { status: 500 },
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const releaseIds = await getReleaseIdsNeedingSnapshot(SNAPSHOT_BATCH_SIZE);
  for (const releaseId of releaseIds) {
    const stats = await getMarketplaceStats(releaseId);
    await insertPriceSnapshot(
      releaseId,
      stats?.lowestPrice ?? null,
      stats?.currency ?? "USD",
      stats?.numForSale ?? 0,
    );
  }

  const candidates = await getWishlistAlertCandidates();
  const alerts = findPriceDropAlerts(candidates);
  const byUser = groupAlertsByUser(alerts);

  let alertsSent = 0;
  for (const [, userAlerts] of byUser) {
    const email = userAlerts[0].email;
    const { subject, html, text } = buildPriceDropEmail(userAlerts);
    const sent = await sendEmail({ to: email, subject, html, text });
    if (sent) {
      alertsSent++;
      for (const alert of userAlerts) {
        await markWishlistAlerted(alert.wishlistItemId, alert.newPrice);
      }
    }
  }

  return NextResponse.json({
    snapshotted: releaseIds.length,
    dropsFound: alerts.length,
    usersAlerted: alertsSent,
  });
}
