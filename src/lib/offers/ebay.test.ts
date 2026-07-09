import { describe, expect, it } from "vitest";
import { ebayItemToOffer } from "./ebay";
import type { ReleaseKey } from "./types";

const blueLines: ReleaseKey = {
  artist: "Massive Attack",
  title: "Blue Lines",
  year: 1991,
  format: "Vinyl, LP, Album",
  upcs: ["0724383900411"],
};

describe("ebayItemToOffer", () => {
  it("marks a GTIN-search hit as verified regardless of title wording", () => {
    const offer = ebayItemToOffer(
      { title: "some oddly worded listing", price: { value: "19.99", currency: "USD" } },
      blueLines,
      true,
    );
    expect(offer.matchTier).toBe("verified");
    expect(offer.matchConfidence).toBe(1);
    expect(offer.matchReason).toContain("GTIN");
  });

  it("falls back to fuzzy scoring for a text-search hit", () => {
    const offer = ebayItemToOffer(
      { title: "Massive Attack - Blue Lines Vinyl LP" },
      blueLines,
      false,
    );
    expect(offer.matchTier).toBe("likely");
    expect(offer.matchConfidence).toBeLessThan(1);
  });

  it("rejects a text-search hit for the wrong album", () => {
    const offer = ebayItemToOffer(
      { title: "Massive Attack - Mezzanine Vinyl LP" },
      blueLines,
      false,
    );
    expect(offer.matchTier).not.toBe("verified");
    expect(offer.matchConfidence).toBeLessThan(0.75);
  });

  it("maps price, shipping, seller, and prefers the affiliate URL", () => {
    const offer = ebayItemToOffer(
      {
        title: "Massive Attack - Blue Lines Vinyl LP",
        price: { value: "24.5", currency: "USD" },
        seller: { username: "vinylshop99" },
        shippingOptions: [{ shippingCost: { value: "4.99" } }],
        itemWebUrl: "https://ebay.com/itm/plain",
        itemAffiliateWebUrl: "https://ebay.com/itm/plain?campid=123",
        condition: "Very Good Plus (VG+)",
      },
      blueLines,
      false,
    );
    expect(offer.source).toBe("ebay");
    expect(offer.price).toBe(24.5);
    expect(offer.shipping).toBe(4.99);
    expect(offer.sellerName).toBe("vinylshop99");
    expect(offer.condition).toBe("Very Good Plus (VG+)");
    expect(offer.url).toBe("https://ebay.com/itm/plain?campid=123");
  });

  it("falls back to the plain URL when no affiliate URL is present", () => {
    const offer = ebayItemToOffer(
      { title: "Massive Attack - Blue Lines Vinyl LP", itemWebUrl: "https://ebay.com/itm/plain" },
      blueLines,
      false,
    );
    expect(offer.url).toBe("https://ebay.com/itm/plain");
  });

  it("handles a missing price as null rather than NaN", () => {
    const offer = ebayItemToOffer({ title: "Massive Attack - Blue Lines Vinyl LP" }, blueLines, false);
    expect(offer.price).toBeNull();
  });
});
