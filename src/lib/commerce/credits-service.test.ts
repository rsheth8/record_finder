import { describe, it, expect } from "vitest";
import { maybeGrantWelcomeCredits, getCreditsForUser } from "@/lib/commerce/credits-service";
import { getCreditBalance } from "@/lib/db/queries";
import { WELCOME_CREDITS } from "@/lib/commerce/free-credits";

let counter = 0;
function uid(prefix = "u") {
  return `${prefix}-${Date.now()}-${counter++}`;
}

describe("maybeGrantWelcomeCredits", () => {
  it("grants the welcome bonus once for a new user", async () => {
    const user = uid("welcome");
    const granted = await maybeGrantWelcomeCredits(user);
    expect(granted).toBe(true);
    expect(await getCreditBalance(user)).toBe(WELCOME_CREDITS);
  });

  it("does not grant the bonus twice", async () => {
    const user = uid("welcome");
    await maybeGrantWelcomeCredits(user);
    const grantedAgain = await maybeGrantWelcomeCredits(user);
    expect(grantedAgain).toBe(false);
    expect(await getCreditBalance(user)).toBe(WELCOME_CREDITS);
  });
});

describe("getCreditsForUser", () => {
  it("ensures the user exists and grants the welcome bonus on first call", async () => {
    const user = uid("balance");
    const balance = await getCreditsForUser(user, "test@example.com");
    expect(balance).toBe(WELCOME_CREDITS);
  });

  it("returns the same balance on a repeat call instead of re-granting", async () => {
    const user = uid("balance");
    await getCreditsForUser(user);
    const second = await getCreditsForUser(user);
    expect(second).toBe(WELCOME_CREDITS);
  });
});
