import { describe, expect, it } from "vitest";
import { searchAllShopifyShops, shopifyProductToOffer } from "./shopify";
import type { ReleaseKey } from "./types";

const blueLines: ReleaseKey = {
  artist: "Massive Attack",
  title: "Blue Lines",
  year: 1991,
  format: "Vinyl, LP, Album",
  upcs: ["0724383900411"],
};

const shop = { name: "Vinyl Corner", domain: "vinylcorner.example.com" };

describe("shopifyProductToOffer", () => {
  it("maps the cheapest available variant to an Offer", () => {
    const offer = shopifyProductToOffer(
      {
        title: "Massive Attack - Blue Lines Vinyl LP",
        handle: "massive-attack-blue-lines-lp",
        variants: [
          { available: true, price: "29.99" },
          { available: true, price: "24.99" },
          { available: false, price: "9.99" }, // cheaper but out of stock
        ],
      },
      shop,
      blueLines,
    );
    expect(offer).not.toBeNull();
    expect(offer!.price).toBe(24.99);
    expect(offer!.source).toBe("shopify");
    expect(offer!.sellerName).toBe("Vinyl Corner");
    expect(offer!.url).toBe("https://vinylcorner.example.com/products/massive-attack-blue-lines-lp");
  });

  it("returns null when every variant is out of stock", () => {
    const offer = shopifyProductToOffer(
      {
        title: "Massive Attack - Blue Lines Vinyl LP",
        handle: "x",
        variants: [{ available: false, price: "24.99" }],
      },
      shop,
      blueLines,
    );
    expect(offer).toBeNull();
  });

  it("never returns a verified tier — the public feed has no barcode to check", () => {
    const offer = shopifyProductToOffer(
      {
        title: "Massive Attack - Blue Lines Vinyl LP",
        handle: "x",
        variants: [{ available: true, price: "24.99" }],
      },
      shop,
      blueLines,
    );
    expect(offer!.matchTier).not.toBe("verified");
    expect(offer!.matchTier).toBe("likely");
  });

  it("scores an unrelated product as rejected", () => {
    const offer = shopifyProductToOffer(
      {
        title: "Radiohead - OK Computer Vinyl",
        handle: "x",
        variants: [{ available: true, price: "24.99" }],
      },
      shop,
      blueLines,
    );
    expect(offer!.matchTier).toBe("rejected");
  });
});

describe("searchAllShopifyShops", () => {
  it("isolates one shop's network failure from the rest", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async (url: string) => {
      if (url.includes("dead-shop")) throw new Error("network down");
      return new Response(
        JSON.stringify({
          products: [
            {
              title: "Massive Attack - Blue Lines Vinyl LP",
              handle: "blue-lines",
              variants: [{ available: true, price: "19.99" }],
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const offers = await searchAllShopifyShops(
        [
          { name: "Dead Shop", domain: "dead-shop.example.com" },
          { name: "Live Shop", domain: "live-shop.example.com" },
        ],
        blueLines,
      );
      expect(offers).toHaveLength(1);
      expect(offers[0].sellerName).toBe("Live Shop");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
