import { describe, expect, it } from "vitest";
import type { DiscogsRelease } from "@/lib/types";
import type { Offer } from "./types";
import { buildReleaseKey, discogsOffer } from "./discogs";
import { dedupeOffers, landedCost, rankOffers } from "./orchestrator";

function offer(partial: Partial<Offer>): Offer {
  return {
    source: "google-shopping",
    sellerName: "Seller",
    listedTitle: "x",
    price: 10,
    currency: "USD",
    shipping: null,
    condition: null,
    url: "",
    availability: "unknown",
    matchConfidence: 0.9,
    matchTier: "likely",
    matchReason: "",
    ...partial,
  };
}

function release(partial: Partial<DiscogsRelease>): DiscogsRelease {
  return {
    id: 1,
    artist: "Massive Attack",
    title: "Blue Lines",
    year: 1991,
    formats: ["Vinyl", "LP", "Album"],
    identifiers: [{ type: "Barcode", value: "7 24383 90041 1" }],
    ...partial,
  } as unknown as DiscogsRelease;
}

describe("landedCost", () => {
  it("adds shipping, treats unknown shipping as 0 and no price as Infinity", () => {
    expect(landedCost(offer({ price: 10, shipping: 5 }))).toBe(15);
    expect(landedCost(offer({ price: 10, shipping: null }))).toBe(10);
    expect(landedCost(offer({ price: null }))).toBe(Infinity);
  });
});

describe("rankOffers", () => {
  it("orders by landed cost, then by confidence", () => {
    const ranked = rankOffers([
      offer({ sellerName: "a", price: 20, shipping: 0 }), // landed 20
      offer({ sellerName: "b", price: 8, shipping: 5 }), //  landed 13 (cheapest)
      offer({ sellerName: "c", price: 15, shipping: 0, matchConfidence: 0.8 }), // 15
      offer({ sellerName: "d", price: 15, shipping: 0, matchConfidence: 1 }), //   15, higher conf
    ]);
    // b cheapest; d before c on the 15 tie (higher confidence); a last.
    expect(ranked.map((o) => o.sellerName)).toEqual(["b", "d", "c", "a"]);
  });
});

describe("dedupeOffers", () => {
  it("collapses same-URL rows keeping the higher confidence", () => {
    const out = dedupeOffers([
      offer({ url: "https://x/1", matchConfidence: 0.8 }),
      offer({ url: "https://x/1", matchConfidence: 0.95 }),
      offer({ url: "https://x/2" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((o) => o.url === "https://x/1")!.matchConfidence).toBe(0.95);
  });

  it("collapses identical seller+price when no URL", () => {
    const out = dedupeOffers([
      offer({ url: "", sellerName: "Shop", price: 12 }),
      offer({ url: "", sellerName: "shop", price: 12 }),
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("discogsOffer", () => {
  it("builds a verified offer from embedded marketplace stats", () => {
    const o = discogsOffer(
      release({
        marketplace: {
          lowestPrice: 24.98,
          currency: "USD",
          numForSale: 12,
          discogsUrl: "https://www.discogs.com/sell/release/1",
        },
      } as Partial<DiscogsRelease>),
    );
    expect(o).not.toBeNull();
    expect(o!.matchTier).toBe("verified");
    expect(o!.price).toBe(24.98);
    expect(o!.matchReason).toContain("12 listings");
  });

  it("returns null when nothing is for sale", () => {
    expect(
      discogsOffer(
        release({
          marketplace: {
            lowestPrice: null,
            currency: "USD",
            numForSale: 0,
            discogsUrl: "https://www.discogs.com/sell/release/1",
          },
        } as Partial<DiscogsRelease>),
      ),
    ).toBeNull();
  });
});

describe("buildReleaseKey", () => {
  it("derives artist/title/format and extracts the UPC", () => {
    const key = buildReleaseKey(release({}));
    expect(key.artist).toBe("Massive Attack");
    expect(key.format).toBe("Vinyl, LP, Album");
    expect(key.upcs).toEqual(["0724383900411"]);
  });
});
