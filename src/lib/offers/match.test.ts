import { describe, expect, it } from "vitest";
import {
  classifyTier,
  contentTokens,
  extractUpcs,
  normalizeGtin,
  scoreMatch,
} from "./match";
import { buildQuery, parseDelivery, serpItemToOffer } from "./google-shopping";
import type { ReleaseKey } from "./types";

const blueLines: ReleaseKey = {
  artist: "Massive Attack",
  title: "Blue Lines",
  year: 1991,
  format: "Vinyl, LP, Album",
  // UPC-A on the sleeve (12 digits) — canonical form is zero-padded to 13.
  upcs: [normalizeGtin("724383900411")!],
};

describe("normalizeGtin", () => {
  it("zero-pads UPC-A (12) to GTIN-13 and keeps EAN-13", () => {
    expect(normalizeGtin("724383900411")).toBe("0724383900411");
    expect(normalizeGtin("0724383900411")).toBe("0724383900411");
  });

  it("treats a UPC-A and its EAN-13 form as equal", () => {
    expect(normalizeGtin("724383900411")).toBe(normalizeGtin("0724383900411"));
  });

  it("strips separators before validating", () => {
    expect(normalizeGtin("7 24383 90041 1")).toBe("0724383900411");
  });

  it("rejects values that aren't 12 or 13 digits", () => {
    expect(normalizeGtin("12345")).toBeNull();
    expect(normalizeGtin("")).toBeNull();
    expect(normalizeGtin(null)).toBeNull();
  });
});

describe("extractUpcs", () => {
  it("pulls valid barcodes and de-duplicates", () => {
    const upcs = extractUpcs([
      { type: "Barcode", value: "7 24383 90041 1", description: "Text" },
      { type: "Barcode", value: "724383900411", description: "Scanned" },
      { type: "Matrix / Runout", value: "ABC-123" },
    ]);
    expect(upcs).toEqual(["0724383900411"]);
  });

  it("ignores non-barcode identifiers and junk barcodes", () => {
    expect(
      extractUpcs([
        { type: "Label Code", value: "LC 0309" },
        { type: "Barcode", value: "n/a" },
      ]),
    ).toEqual([]);
  });

  it("handles a missing identifiers array", () => {
    expect(extractUpcs(undefined)).toEqual([]);
  });
});

describe("contentTokens", () => {
  it("drops format/filler words and punctuation", () => {
    expect(contentTokens("OK Computer (Vinyl LP, Album)")).toEqual([
      "ok",
      "computer",
    ]);
  });
});

describe("scoreMatch", () => {
  it("returns full confidence on an exact UPC match regardless of title", () => {
    const r = scoreMatch(blueLines, {
      title: "some totally different wording",
      upc: "0724383900411",
    });
    expect(r.confidence).toBe(1);
    expect(r.tier).toBe("verified");
  });

  it("scores a clean vinyl listing as a likely match", () => {
    const r = scoreMatch(blueLines, {
      title: "Massive Attack - Blue Lines (Vinyl LP)",
    });
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
    expect(r.tier).toBe("likely");
  });

  it("rejects a different album by the same artist", () => {
    const r = scoreMatch(blueLines, {
      title: "Massive Attack - Mezzanine Vinyl LP",
    });
    // Artist matches but the album title doesn't — must not clear "likely".
    expect(r.confidence).toBeLessThan(0.75);
  });

  it("penalizes a CD so it can never outrank a vinyl match", () => {
    const vinyl = scoreMatch(blueLines, {
      title: "Massive Attack - Blue Lines Vinyl LP",
    });
    const cd = scoreMatch(blueLines, {
      title: "Massive Attack - Blue Lines CD Album",
    });
    expect(cd.confidence).toBeLessThan(vinyl.confidence);
    expect(cd.confidence).toBeLessThanOrEqual(0.45);
  });

  it("rejects an unrelated record", () => {
    const r = scoreMatch(blueLines, { title: "Radiohead - OK Computer Vinyl" });
    expect(r.tier).toBe("rejected");
  });
});

describe("classifyTier", () => {
  it("maps confidence to tiers", () => {
    expect(classifyTier(1)).toBe("verified");
    expect(classifyTier(0.8)).toBe("likely");
    expect(classifyTier(0.6)).toBe("possible");
    expect(classifyTier(0.3)).toBe("rejected");
  });
});

describe("google-shopping mapping", () => {
  it("builds a UPC query when available, else artist+title+vinyl", () => {
    expect(buildQuery(blueLines)).toBe("0724383900411");
    expect(buildQuery({ ...blueLines, upcs: [] })).toBe(
      "Massive Attack Blue Lines vinyl LP",
    );
  });

  it("parses delivery strings into a shipping number", () => {
    expect(parseDelivery("Free delivery")).toBe(0);
    expect(parseDelivery("$5.99 delivery")).toBe(5.99);
    expect(parseDelivery(undefined)).toBeNull();
  });

  it("maps a SerpApi item into a scored Offer", () => {
    const offer = serpItemToOffer(
      {
        title: "Massive Attack - Blue Lines [Vinyl LP]",
        source: "Walmart",
        extracted_price: 21.99,
        delivery: "Free delivery",
        product_link: "https://example.com/x",
      },
      blueLines,
    );
    expect(offer.source).toBe("google-shopping");
    expect(offer.sellerName).toBe("Walmart");
    expect(offer.price).toBe(21.99);
    expect(offer.shipping).toBe(0);
    expect(offer.matchTier).toBe("likely");
  });
});
