import {
  addCreditEntry,
  ensureUser,
  getCreditBalance,
  getCreditHistory,
} from "@/lib/db/queries";
import { WELCOME_CREDITS } from "@/lib/commerce/free-credits";

export async function maybeGrantWelcomeCredits(userId: string) {
  const history = await getCreditHistory(userId);
  const hasWelcome = history.some((h) => h.reason === "Welcome bonus");
  if (hasWelcome) return false;

  await addCreditEntry({
    userId,
    delta: WELCOME_CREDITS,
    reason: "Welcome bonus",
  });
  return true;
}

export async function getCreditsForUser(userId: string, email?: string | null) {
  await ensureUser(userId, email);
  await maybeGrantWelcomeCredits(userId);
  return getCreditBalance(userId);
}
