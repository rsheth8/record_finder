import { auth } from "@/lib/auth";
import {
  addCreditEntry,
  ensureUser,
  getCreditBalance,
  getCreditHistory,
} from "@/lib/db/queries";
import {
  DAILY_BONUS_CREDITS,
  getFreeBonus,
} from "@/lib/commerce/free-credits";
import { NextRequest, NextResponse } from "next/server";

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await request.json();
  const bonus = getFreeBonus(body.bonusId ?? "daily");
  if (!bonus || bonus.type !== "daily") {
    return NextResponse.json({ error: "Invalid bonus" }, { status: 400 });
  }

  await ensureUser(session.user.id, session.user.email);

  const history = await getCreditHistory(session.user.id);
  const today = new Date();
  const alreadyClaimed = history.some(
    (h) =>
      h.reason === "Daily dig bonus" &&
      h.createdAt &&
      isSameUtcDay(new Date(h.createdAt), today),
  );

  if (alreadyClaimed) {
    return NextResponse.json(
      { error: "Daily bonus already claimed today" },
      { status: 400 },
    );
  }

  await addCreditEntry({
    userId: session.user.id,
    delta: DAILY_BONUS_CREDITS,
    reason: "Daily dig bonus",
  });

  const balance = await getCreditBalance(session.user.id);
  return NextResponse.json({ balance, granted: DAILY_BONUS_CREDITS });
}
