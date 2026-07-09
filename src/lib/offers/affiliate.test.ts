import { describe, expect, it } from "vitest";
import { applyAffiliateTag, hasAffiliateLink, wrapWithSkimlinks } from "./affiliate";
import { buildEndUserCtx } from "./ebay";
import type { Offer } from "./types";

function offer(partial: Partial<Offer>): Offer {
  return {
    source: "google-shopping",
    sellerName: "Some Shop",
    listedTitle: "x",
    price: 10,
    currency: "USD",
    shipping: null,
    condition: null,
    url: "https://example.com/product/1",
    availability: "unknown",
    matchConfidence: 0.9,
    matchTier: "likely",
    matchReason: "",
    ...partial,
  };
}

describe("wrapWithSkimlinks", () => {
  it("builds a go.skimresources.com redirect with id/xs/url", () => {
    const wrapped = wrapWithSkimlinks("https://example.com/x?y=1", "12345X1");
    const parsed = new URL(wrapped);
    expect(parsed.hostname).toBe("go.skimresources.com");
    expect(parsed.searchParams.get("id")).toBe("12345X1");
    expect(parsed.searchParams.get("xs")).toBe("1");
    expect(parsed.searchParams.get("url")).toBe("https://example.com/x?y=1");
  });

  it("sanitizes xcust to Skimlinks' allowed charset and length", () => {
    const wrapped = wrapWithSkimlinks("https://example.com", "pub1", "google-shopping!!! ");
    const parsed = new URL(wrapped);
    expect(parsed.searchParams.get("xcust")).toBe("googleshopping");
  });
});

describe("applyAffiliateTag", () => {
  it("wraps a google-shopping offer when Skimlinks is configured", () => {
    const tagged = applyAffiliateTag(offer({ source: "google-shopping" }), {
      skimlinksPublisherId: "pub1",
    });
    expect(tagged.url).toContain("go.skimresources.com");
    expect(tagged.url).toContain(encodeURIComponent("https://example.com/product/1"));
  });

  it("leaves the offer untouched when Skimlinks isn't configured", () => {
    const original = offer({ source: "google-shopping" });
    expect(applyAffiliateTag(original, {})).toEqual(original);
  });

  it("never rewrites eBay or Discogs offers, even with Skimlinks configured", () => {
    const ebayOffer = offer({ source: "ebay", url: "https://ebay.com/itm/1?campid=X" });
    const discogsOffer = offer({ source: "discogs", url: "https://discogs.com/sell/release/1" });
    const config = { skimlinksPublisherId: "pub1" };
    expect(applyAffiliateTag(ebayOffer, config).url).toBe(ebayOffer.url);
    expect(applyAffiliateTag(discogsOffer, config).url).toBe(discogsOffer.url);
  });

  it("leaves an offer with no URL untouched", () => {
    const noUrl = offer({ url: "" });
    expect(applyAffiliateTag(noUrl, { skimlinksPublisherId: "pub1" }).url).toBe("");
  });
});

describe("hasAffiliateLink", () => {
  it("is false when no offer is actually affiliate-tagged", () => {
    expect(
      hasAffiliateLink([
        offer({ source: "discogs", url: "https://discogs.com/x" }),
        offer({ source: "ebay", url: "https://ebay.com/itm/1" }), // no campid
      ]),
    ).toBe(false);
  });

  it("is true when a Skimlinks-wrapped URL is present", () => {
    expect(
      hasAffiliateLink([offer({ url: "https://go.skimresources.com/?id=1&url=x" })]),
    ).toBe(true);
  });

  it("is true when an eBay offer carries a campid", () => {
    expect(
      hasAffiliateLink([
        offer({ source: "ebay", url: "https://ebay.com/itm/1?campid=123" }),
      ]),
    ).toBe(true);
  });
});

describe("buildEndUserCtx (eBay affiliate header)", () => {
  it("builds the campaign-only form", () => {
    expect(buildEndUserCtx("1234567890")).toBe("affiliateCampaignId=1234567890");
  });

  it("includes an optional reference id", () => {
    expect(buildEndUserCtx("1234567890", "ref-1")).toBe(
      "affiliateCampaignId=1234567890,affiliateReferenceId=ref-1",
    );
  });
});
