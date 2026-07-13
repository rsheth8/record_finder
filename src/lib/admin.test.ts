import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isAdminEmail } from "@/lib/admin";

describe("isAdminEmail", () => {
  const original = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    process.env.ADMIN_EMAIL = "owner@example.com";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = original;
  });

  it("matches the configured admin email", () => {
    expect(isAdminEmail("owner@example.com")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isAdminEmail("Owner@Example.com")).toBe(true);
  });

  it("rejects a different email", () => {
    expect(isAdminEmail("someone-else@example.com")).toBe(false);
  });

  it("rejects a null/undefined email", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it("fails closed when ADMIN_EMAIL isn't configured", () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdminEmail("owner@example.com")).toBe(false);
  });
});
