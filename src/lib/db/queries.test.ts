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
  createReservation,
  getReservationCountForRelease,
  ensureUser,
  insertPriceSnapshot,
  getLatestPriceSnapshot,
  getPriceHistoryStatsForReleases,
  getReleaseIdsNeedingSnapshot,
  setWishlistPriceAtAdd,
  getWishlistAlertCandidates,
  markWishlistAlerted,
  addLocalShop,
  listActiveLocalShops,
} from "@/lib/db/queries";

// Each test uses distinct user ids so they don't collide within the shared DB.
let counter = 0;
function uid(prefix = "u") {
  return `${prefix}-${Date.now()}-${counter++}`;
}

// Release ids also need to be unique per test for the same reason.
let releaseCounter = 0;
function rid() {
  return Date.now() * 1000 + releaseCounter++;
}

// local_shops.domain is unique, so each test needs its own.
let domainCounter = 0;
function testDomain() {
  return `test-shop-${Date.now()}-${domainCounter++}.example.com`;
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

describe("getReservationCountForRelease", () => {
  it("counts reservations for a release across different users", async () => {
    const release = rid();
    expect(await getReservationCountForRelease(release)).toBe(0);

    await createReservation({
      userId: uid("res"),
      discogsReleaseId: release,
      title: "Test Album",
      artist: "Test Artist",
      creditsSpent: 50,
      discogsUrl: "https://discogs.com/x",
    });
    await createReservation({
      userId: uid("res"),
      discogsReleaseId: release,
      title: "Test Album",
      artist: "Test Artist",
      creditsSpent: 50,
      discogsUrl: "https://discogs.com/x",
    });

    expect(await getReservationCountForRelease(release)).toBe(2);
  });

  it("keeps counts isolated per release", async () => {
    const releaseA = rid();
    const releaseB = rid();
    await createReservation({
      userId: uid("res"),
      discogsReleaseId: releaseA,
      title: "A",
      artist: "Artist",
      creditsSpent: 50,
      discogsUrl: "https://discogs.com/a",
    });
    expect(await getReservationCountForRelease(releaseB)).toBe(0);
    expect(await getReservationCountForRelease(releaseA)).toBe(1);
  });
});

describe("price history", () => {
  it("round-trips a snapshot and reads back the latest one", async () => {
    const release = rid();
    await insertPriceSnapshot(release, 25.5, "USD", 3);
    const latest = await getLatestPriceSnapshot(release);
    expect(latest?.lowestPrice).toBe(25.5);
  });

  it("returns the most recently inserted snapshot when there are several", async () => {
    const release = rid();
    await insertPriceSnapshot(release, 40, "USD", 2);
    await insertPriceSnapshot(release, 30, "USD", 4);
    const latest = await getLatestPriceSnapshot(release);
    expect(latest?.lowestPrice).toBe(30);
  });

  it("returns null for a release with no snapshots", async () => {
    expect(await getLatestPriceSnapshot(rid())).toBeNull();
  });

  it("computes count and median across multiple releases in one call", async () => {
    const releaseA = rid();
    const releaseB = rid();
    for (const price of [10, 20, 30]) {
      await insertPriceSnapshot(releaseA, price, "USD", 1);
    }
    await insertPriceSnapshot(releaseB, 100, "USD", 1);

    const stats = await getPriceHistoryStatsForReleases([releaseA, releaseB], 30);
    expect(stats.get(releaseA)).toEqual({ count: 3, median: 20 });
    expect(stats.get(releaseB)).toEqual({ count: 1, median: 100 });
  });

  it("omits a release with no priced snapshots from the stats map", async () => {
    const release = rid();
    await insertPriceSnapshot(release, null, "USD", 0);
    const stats = await getPriceHistoryStatsForReleases([release], 30);
    expect(stats.has(release)).toBe(false);
  });

  it("orders never-snapshotted releases before ones with a stale snapshot", async () => {
    const user = uid("snapshot-order");
    const neverSnapshotted = rid();
    const staleSnapshot = rid();
    await addToWishlist(user, {
      discogsReleaseId: neverSnapshotted,
      title: "Never",
      artist: "X",
      coverUrl: null,
      year: null,
      notes: "",
    });
    await addToWishlist(user, {
      discogsReleaseId: staleSnapshot,
      title: "Stale",
      artist: "X",
      coverUrl: null,
      year: null,
      notes: "",
    });
    await insertPriceSnapshot(staleSnapshot, 20, "USD", 1);

    const ordered = await getReleaseIdsNeedingSnapshot(1000);
    const neverIdx = ordered.indexOf(neverSnapshotted);
    const staleIdx = ordered.indexOf(staleSnapshot);
    expect(neverIdx).toBeGreaterThanOrEqual(0);
    expect(staleIdx).toBeGreaterThanOrEqual(0);
    expect(neverIdx).toBeLessThan(staleIdx);
  });

  it("captures priceAtAdd and lets it be read back via getWishlist", async () => {
    const user = uid("price-at-add");
    const release = rid();
    await addToWishlist(user, {
      discogsReleaseId: release,
      title: "T",
      artist: "A",
      coverUrl: null,
      year: null,
      notes: "",
    });
    expect((await getWishlist(user))[0].priceAtAdd).toBeNull();

    await setWishlistPriceAtAdd(user, release, 42.5);
    expect((await getWishlist(user))[0].priceAtAdd).toBe(42.5);
  });

  describe("getWishlistAlertCandidates + markWishlistAlerted", () => {
    it("surfaces a wishlist item with its latest price and the owner's email", async () => {
      const user = uid("alert-candidate");
      const release = rid();
      await ensureUser(user, "collector@example.com");
      await addToWishlist(user, {
        discogsReleaseId: release,
        title: "T",
        artist: "A",
        coverUrl: null,
        year: null,
        notes: "",
      });
      await setWishlistPriceAtAdd(user, release, 40);
      await insertPriceSnapshot(release, 22, "USD", 1);

      const candidates = await getWishlistAlertCandidates();
      const mine = candidates.find((c) => c.discogsReleaseId === release);
      expect(mine).toMatchObject({
        userId: user,
        email: "collector@example.com",
        priceAtAdd: 40,
        latestPrice: 22,
      });
    });

    it("updates lastAlertedPrice so it's reflected on the next read", async () => {
      const user = uid("mark-alerted");
      const release = rid();
      await addToWishlist(user, {
        discogsReleaseId: release,
        title: "T",
        artist: "A",
        coverUrl: null,
        year: null,
        notes: "",
      });
      const [item] = await getWishlist(user);
      await markWishlistAlerted(item.id, 22);
      expect((await getWishlist(user))[0].lastAlertedPrice).toBe(22);
    });
  });
});

describe("local shops", () => {
  it("registers a shop and lists it as active", async () => {
    const domain = testDomain();
    await addLocalShop({ name: "Test Vinyl Co", domain, city: "Austin", region: "TX" });
    const shops = await listActiveLocalShops();
    expect(shops.some((s) => s.domain === domain && s.name === "Test Vinyl Co")).toBe(true);
  });

  it("is idempotent — registering the same domain twice doesn't duplicate or error", async () => {
    const domain = testDomain();
    await addLocalShop({ name: "First Name", domain });
    await addLocalShop({ name: "Second Name", domain });
    const shops = await listActiveLocalShops();
    const matches = shops.filter((s) => s.domain === domain);
    expect(matches).toHaveLength(1);
    // onConflictDoNothing means the *first* registration wins.
    expect(matches[0].name).toBe("First Name");
  });
});
