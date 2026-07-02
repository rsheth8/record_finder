import { auth } from "@/lib/auth";
import {
  addCreditEntry,
  createReservation,
  ensureUser,
  getCreditBalance,
} from "@/lib/db/queries";
import { getMarketplaceStats } from "@/lib/discogs/client";
import { usdToCredits } from "@/lib/commerce/pricing";
import { createOrderSchema } from "@/lib/validation/orders";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const parsed = createOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { discogsReleaseId, title, artist } = parsed.data;

  const marketplace = await getMarketplaceStats(discogsReleaseId);
  if (!marketplace || marketplace.numForSale === 0) {
    return NextResponse.json(
      { error: "This release is not currently for sale" },
      { status: 400 },
    );
  }

  const creditCost =
    parsed.data.creditsSpent || usdToCredits(marketplace.lowestPrice ?? 5);

  await ensureUser(session.user.id, session.user.email);
  const balance = await getCreditBalance(session.user.id);

  if (balance < creditCost) {
    return NextResponse.json(
      { error: "Insufficient credits", balance, required: creditCost },
      { status: 402 },
    );
  }

  await addCreditEntry({
    userId: session.user.id,
    delta: -creditCost,
    reason: `Reserved: ${artist} — ${title}`,
  });

  const reservation = await createReservation({
    userId: session.user.id,
    discogsReleaseId,
    title,
    artist,
    creditsSpent: creditCost,
    discogsUrl: marketplace.discogsUrl,
  });

  const newBalance = await getCreditBalance(session.user.id);

  return NextResponse.json({ reservation, balance: newBalance });
}
