import { describe, it, expect } from "vitest";
import { findPriceDropAlerts, groupAlertsByUser } from "@/lib/commerce/price-alerts";
import type { WishlistAlertCandidate } from "@/lib/db/queries";

function candidate(overrides: Partial<WishlistAlertCandidate>): WishlistAlertCandidate {
  return {
    wishlistItemId: 1,
    userId: "user-1",
    email: "user@example.com",
    discogsReleaseId: 100,
    title: "Title",
    artist: "Artist",
    priceAtAdd: 40,
    lastAlertedPrice: null,
    latestPrice: 40,
    ...overrides,
  };
}

describe("findPriceDropAlerts", () => {
  it("alerts when the price dropped more than the threshold below priceAtAdd", () => {
    const c = candidate({ priceAtAdd: 40, latestPrice: 30 }); // 25% off
    expect(findPriceDropAlerts([c])).toHaveLength(1);
  });

  it("does not alert for a drop below the threshold", () => {
    const c = candidate({ priceAtAdd: 40, latestPrice: 38 }); // 5% off
    expect(findPriceDropAlerts([c])).toHaveLength(0);
  });

  it("does not alert when the price went up", () => {
    const c = candidate({ priceAtAdd: 40, latestPrice: 50 });
    expect(findPriceDropAlerts([c])).toHaveLength(0);
  });

  it("uses lastAlertedPrice as the baseline once set, not priceAtAdd", () => {
    // Already alerted once at $30; a further drop to $29 is below the 10%
    // threshold off $30, so it should NOT re-alert even though it's well
    // below the original $40 priceAtAdd.
    const c = candidate({ priceAtAdd: 40, lastAlertedPrice: 30, latestPrice: 29 });
    expect(findPriceDropAlerts([c])).toHaveLength(0);
  });

  it("alerts again on a further drop below the last-alerted price", () => {
    const c = candidate({ priceAtAdd: 40, lastAlertedPrice: 30, latestPrice: 20 });
    expect(findPriceDropAlerts([c])).toHaveLength(1);
  });

  it("skips items with no baseline price (never captured at add-time)", () => {
    const c = candidate({ priceAtAdd: null, lastAlertedPrice: null, latestPrice: 5 });
    expect(findPriceDropAlerts([c])).toHaveLength(0);
  });

  it("skips items with no current price (not for sale)", () => {
    const c = candidate({ priceAtAdd: 40, latestPrice: null });
    expect(findPriceDropAlerts([c])).toHaveLength(0);
  });

  it("skips items with no email on file", () => {
    const c = candidate({ email: null, priceAtAdd: 40, latestPrice: 20 });
    expect(findPriceDropAlerts([c])).toHaveLength(0);
  });

  it("carries through the release details needed for the email", () => {
    const c = candidate({
      wishlistItemId: 7,
      discogsReleaseId: 999,
      title: "Nevermind",
      artist: "Nirvana",
      priceAtAdd: 40,
      latestPrice: 20,
    });
    const [alert] = findPriceDropAlerts([c]);
    expect(alert).toMatchObject({
      wishlistItemId: 7,
      discogsReleaseId: 999,
      title: "Nevermind",
      artist: "Nirvana",
      oldPrice: 40,
      newPrice: 20,
    });
  });
});

describe("groupAlertsByUser", () => {
  it("groups multiple alerts for the same user into one list", () => {
    const alerts = findPriceDropAlerts([
      candidate({ wishlistItemId: 1, userId: "a", discogsReleaseId: 1, priceAtAdd: 40, latestPrice: 20 }),
      candidate({ wishlistItemId: 2, userId: "a", discogsReleaseId: 2, priceAtAdd: 40, latestPrice: 20 }),
      candidate({ wishlistItemId: 3, userId: "b", discogsReleaseId: 3, priceAtAdd: 40, latestPrice: 20 }),
    ]);
    const grouped = groupAlertsByUser(alerts);
    expect(grouped.get("a")).toHaveLength(2);
    expect(grouped.get("b")).toHaveLength(1);
  });
});
