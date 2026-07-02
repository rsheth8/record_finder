import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory cookie jar standing in for Next's request-scoped cookie store.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

import {
  readGuestId,
  readOrCreateGuestId,
  clearGuestCookie,
  isGuestId,
} from "@/lib/guest-cookie";

beforeEach(() => jar.clear());

describe("guest cookie", () => {
  it("returns null when no cookie is present", async () => {
    expect(await readGuestId()).toBeNull();
  });

  it("mints a guest id and round-trips it", async () => {
    const id = await readOrCreateGuestId();
    expect(isGuestId(id)).toBe(true);
    expect(await readGuestId()).toBe(id);
  });

  it("reuses the existing id instead of minting a new one", async () => {
    const first = await readOrCreateGuestId();
    const second = await readOrCreateGuestId();
    expect(second).toBe(first);
  });

  it("rejects a tampered signature", async () => {
    await readOrCreateGuestId();
    const raw = jar.get("rf_guest")!;
    const [value] = raw.split(".");
    jar.set("rf_guest", `${value}.forged`);
    expect(await readGuestId()).toBeNull();
  });

  it("rejects a forged value with a stale signature", async () => {
    await readOrCreateGuestId();
    const sig = jar.get("rf_guest")!.split(".")[1];
    jar.set("rf_guest", `guest:attacker.${sig}`);
    expect(await readGuestId()).toBeNull();
  });

  it("clears the cookie", async () => {
    await readOrCreateGuestId();
    await clearGuestCookie();
    expect(await readGuestId()).toBeNull();
  });
});
