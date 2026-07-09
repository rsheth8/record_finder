import { describe, it, expect } from "vitest";
import { buildPriceDropEmail } from "@/lib/email/price-drop-alert";

describe("buildPriceDropEmail", () => {
  it("uses a singular, specific subject for one item", () => {
    const email = buildPriceDropEmail([
      { discogsReleaseId: 1, title: "Nevermind", artist: "Nirvana", oldPrice: 40, newPrice: 22 },
    ]);
    expect(email.subject).toBe("Price drop: Nevermind is now $22.00");
  });

  it("uses a count-based subject for multiple items", () => {
    const email = buildPriceDropEmail([
      { discogsReleaseId: 1, title: "A", artist: "X", oldPrice: 40, newPrice: 20 },
      { discogsReleaseId: 2, title: "B", artist: "Y", oldPrice: 30, newPrice: 25 },
    ]);
    expect(email.subject).toBe("2 records on your wishlist just dropped in price");
  });

  it("includes each item's old and new price and a link to its album page", () => {
    const email = buildPriceDropEmail([
      { discogsReleaseId: 42, title: "Nevermind", artist: "Nirvana", oldPrice: 40, newPrice: 22 },
    ]);
    expect(email.html).toContain("/album/42");
    expect(email.html).toContain("$40.00");
    expect(email.html).toContain("$22.00");
    expect(email.text).toContain("/album/42");
    expect(email.text).toContain("$40.00");
    expect(email.text).toContain("$22.00");
  });

  it("orders items by biggest percentage discount first", () => {
    const email = buildPriceDropEmail([
      { discogsReleaseId: 1, title: "SmallDrop", artist: "X", oldPrice: 100, newPrice: 90 }, // 10% off
      { discogsReleaseId: 2, title: "BigDrop", artist: "Y", oldPrice: 100, newPrice: 50 }, // 50% off
    ]);
    expect(email.text.indexOf("BigDrop")).toBeLessThan(email.text.indexOf("SmallDrop"));
  });

  it("handles a zero old price without dividing by zero", () => {
    expect(() =>
      buildPriceDropEmail([
        { discogsReleaseId: 1, title: "Free?", artist: "X", oldPrice: 0, newPrice: 0 },
      ]),
    ).not.toThrow();
  });
});
