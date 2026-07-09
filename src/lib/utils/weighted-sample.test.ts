import { describe, it, expect } from "vitest";
import { weightedSample } from "@/lib/utils/weighted-sample";

describe("weightedSample", () => {
  it("returns k items with no duplicates", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const out = weightedSample(items, 5, () => 1);
    expect(out).toHaveLength(5);
    expect(new Set(out).size).toBe(5);
    for (const v of out) expect(items).toContain(v);
  });

  it("returns all items (unchanged set) when k >= items.length", () => {
    const items = [1, 2, 3];
    const out = weightedSample(items, 5, () => 1);
    expect(out).toHaveLength(3);
    expect(new Set(out)).toEqual(new Set(items));
  });

  it("is deterministic given an injected rng", () => {
    const items = ["a", "b", "c", "d"];
    const rng = (() => {
      const seq = [0.9, 0.1, 0.5, 0.3];
      let i = 0;
      return () => seq[i++ % seq.length];
    })();
    const out1 = weightedSample(items, 2, () => 1, rng);
    const rng2 = (() => {
      const seq = [0.9, 0.1, 0.5, 0.3];
      let i = 0;
      return () => seq[i++ % seq.length];
    })();
    const out2 = weightedSample(items, 2, () => 1, rng2);
    expect(out1).toEqual(out2);
  });

  it("heavily biases selection toward high-weight items over many trials", () => {
    const items = ["rare", "common"];
    const weight = (item: string) => (item === "common" ? 10000 : 1);
    let commonPicked = 0;
    const trials = 300;
    for (let i = 0; i < trials; i++) {
      const [picked] = weightedSample(items, 1, weight);
      if (picked === "common") commonPicked++;
    }
    // Not deterministic, but with a 10000:1 weight ratio "common" should
    // dominate the vast majority of single-pick trials.
    expect(commonPicked / trials).toBeGreaterThan(0.9);
  });

  it("does not crash or throw on a literal zero weight", () => {
    const items = ["zero", "normal"];
    const weight = (item: string) => (item === "zero" ? 0 : 5);
    expect(() => weightedSample(items, 1, weight)).not.toThrow();
  });

  it("gives a moderately lower-weight item some chance over many trials", () => {
    // A 1:50 ratio (not the astronomical ratio of the bias test above) should
    // still let the lighter item win occasionally — no item is *deterministically*
    // excluded short of a literal zero weight.
    const items = ["rare", "common"];
    const weight = (item: string) => (item === "common" ? 50 : 1);
    let rarePicked = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const [picked] = weightedSample(items, 1, weight);
      if (picked === "rare") rarePicked++;
    }
    expect(rarePicked).toBeGreaterThan(0);
  });
});
