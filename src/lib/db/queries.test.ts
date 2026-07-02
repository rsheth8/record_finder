import { describe, it, expect } from "vitest";
import {
  getCreditBalance,
  addCreditEntry,
  setFeedback,
  getUserFeedback,
  getReleaseFeedback,
  removeFeedback,
  addToWishlist,
  getWishlist,
  saveTasteProfileToDb,
  getTasteProfileFromDb,
  mergeGuestData,
} from "@/lib/db/queries";

// Each test uses distinct user ids so they don't collide within the shared DB.
let counter = 0;
function uid(prefix = "u") {
  return `${prefix}-${Date.now()}-${counter++}`;
}

// Note: the throwaway DB file (./data/vitest-test.db) persists across runs.
// Every test uses a unique user id, so prior data never affects assertions, and
// drizzle migrations are idempotent — no need to delete the open DB file.

describe("credit ledger", () => {
  it("sums deltas to a running balance", async () => {
    const user = uid("credit");
    expect(await getCreditBalance(user)).toBe(0);
    await addCreditEntry({ userId: user, delta: 10, reason: "Welcome bonus" });
    await addCreditEntry({ userId: user, delta: 5, reason: "Daily bonus" });
    await addCreditEntry({ userId: user, delta: -3, reason: "Reservation" });
    expect(await getCreditBalance(user)).toBe(12);
  });

  it("keeps balances isolated per user", async () => {
    const a = uid();
    const b = uid();
    await addCreditEntry({ userId: a, delta: 100, reason: "test" });
    expect(await getCreditBalance(b)).toBe(0);
  });
});

describe("feedback", () => {
  it("upserts a single signal per release and reads it back", async () => {
    const user = uid("fb");
    await setFeedback(user, { discogsReleaseId: 1, artist: "Nirvana", signal: "like" });
    await setFeedback(user, { discogsReleaseId: 1, artist: "Nirvana", signal: "dislike" });
    expect(await getReleaseFeedback(user, 1)).toBe("dislike");
    expect(await getUserFeedback(user)).toHaveLength(1);
  });

  it("removes feedback", async () => {
    const user = uid("fb");
    await setFeedback(user, { discogsReleaseId: 2, artist: "Adele", signal: "own" });
    await removeFeedback(user, 2);
    expect(await getReleaseFeedback(user, 2)).toBeNull();
  });
});

describe("mergeGuestData", () => {
  it("adopts the guest's quiz when the account has none", async () => {
    const guest = uid("guest");
    const user = uid("real");
    await saveTasteProfileToDb(guest, {
      genres: ["Jazz"],
      decades: ["1960s"],
      moods: ["Chill"],
      albumPreference: "full_albums",
      deepCutLevel: 80,
      completed: true,
    });

    await mergeGuestData(guest, user);

    expect(await getTasteProfileFromDb(guest)).toBeNull();
    const merged = await getTasteProfileFromDb(user);
    expect(merged?.genres).toEqual(["Jazz"]);
    expect(merged?.completedAt).toBeTruthy();
  });

  it("keeps the account's own quiz when both exist", async () => {
    const guest = uid("guest");
    const user = uid("real");
    await saveTasteProfileToDb(user, {
      genres: ["Rock"],
      decades: ["1970s"],
      moods: [],
      albumPreference: "balanced",
      deepCutLevel: 50,
      completed: true,
    });
    await saveTasteProfileToDb(guest, {
      genres: ["Pop"],
      decades: ["2010s"],
      moods: [],
      albumPreference: "singles",
      deepCutLevel: 20,
      completed: true,
    });

    await mergeGuestData(guest, user);

    expect((await getTasteProfileFromDb(user))?.genres).toEqual(["Rock"]);
    expect(await getTasteProfileFromDb(guest)).toBeNull();
  });

  it("merges non-colliding wishlist rows and drops duplicates", async () => {
    const guest = uid("guest");
    const user = uid("real");
    await addToWishlist(user, { discogsReleaseId: 100, title: "Shared", artist: "X", coverUrl: null, year: null, notes: "" });
    await addToWishlist(guest, { discogsReleaseId: 100, title: "Shared", artist: "X", coverUrl: null, year: null, notes: "" });
    await addToWishlist(guest, { discogsReleaseId: 200, title: "GuestOnly", artist: "Y", coverUrl: null, year: null, notes: "" });

    await mergeGuestData(guest, user);

    const userList = await getWishlist(user);
    expect(userList.map((w) => w.discogsReleaseId).sort()).toEqual([100, 200]);
    expect(await getWishlist(guest)).toHaveLength(0);
  });

  it("is a no-op when guest and user are the same id", async () => {
    const user = uid("same");
    await addToWishlist(user, { discogsReleaseId: 5, title: "Keep", artist: "Z", coverUrl: null, year: null, notes: "" });
    await mergeGuestData(user, user);
    expect(await getWishlist(user)).toHaveLength(1);
  });
});
