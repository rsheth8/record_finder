import { describe, expect, it } from "vitest";
import { parseJson } from "./utils";

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson("[1,2,3]", [])).toEqual([1, 2, 3]);
    expect(parseJson('{"a":1}', {})).toEqual({ a: 1 });
  });

  it("falls back on malformed JSON", () => {
    expect(parseJson("not json", ["fallback"])).toEqual(["fallback"]);
  });

  it("falls back on null input rather than returning the JS value null", () => {
    // A genuinely SQL-NULL DB column comes through as JS `null` here.
    // JSON.parse(null) coerces to JSON.parse("null"), which is valid JSON and
    // successfully parses to `null` without throwing — silently bypassing the
    // fallback if not guarded explicitly. This is the regression this test
    // locks in (root cause of a real production crash: a caller expecting an
    // array got `null` back and called `.length`/`.map` on it).
    expect(parseJson(null, [])).toEqual([]);
    expect(parseJson(null, [])).not.toBeNull();
  });

  it("falls back on undefined input", () => {
    expect(parseJson(undefined, {})).toEqual({});
  });
});
