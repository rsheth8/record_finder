import { describe, it, expect } from "vitest";
import { reservationCapForRelease, RESERVATION_CAP_PER_RELEASE } from "@/lib/commerce/reservations";

describe("reservationCapForRelease", () => {
  it("caps at RESERVATION_CAP_PER_RELEASE when listings are abundant", () => {
    expect(reservationCapForRelease(500)).toBe(RESERVATION_CAP_PER_RELEASE);
  });

  it("ties the cap to numForSale when it's below the max", () => {
    expect(reservationCapForRelease(2)).toBe(2);
  });

  it("returns 0 when nothing is for sale", () => {
    expect(reservationCapForRelease(0)).toBe(0);
  });

  it("never goes negative for an invalid negative input", () => {
    expect(reservationCapForRelease(-3)).toBe(0);
  });
});
