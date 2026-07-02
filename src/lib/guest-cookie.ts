import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

/** Signed, httpOnly cookie holding an anonymous visitor's id so guests can take
 * the quiz and get picks before connecting Spotify. Kept dependency-free (no
 * import of auth.ts) so both identity.ts and auth.ts can use it without a cycle. */
const GUEST_COOKIE = "rf_guest";
const GUEST_PREFIX = "guest:";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isGuestId(userId: string): boolean {
  return userId.startsWith(GUEST_PREFIX);
}

function sign(value: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function serialize(guestId: string): string {
  return `${guestId}.${sign(guestId)}`;
}

/** Returns the guest id if the cookie is present and its signature is valid,
 * else null. Tamper-resistant so a guest can't forge another id. */
function verify(raw: string | undefined): string | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf(".");
  if (idx === -1) return null;
  const value = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);

  const expected = sign(value);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return isGuestId(value) ? value : null;
}

/** Read-only: safe in Server Components. */
export async function readGuestId(): Promise<string | null> {
  const store = await cookies();
  return verify(store.get(GUEST_COOKIE)?.value);
}

/** Returns the existing guest id, or mints one and sets the cookie. Only call
 * from a Route Handler or Server Function (cookies can't be set while rendering). */
export async function readOrCreateGuestId(): Promise<string> {
  const store = await cookies();
  const existing = verify(store.get(GUEST_COOKIE)?.value);
  if (existing) return existing;

  const guestId = `${GUEST_PREFIX}${randomUUID()}`;
  store.set(GUEST_COOKIE, serialize(guestId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return guestId;
}

/** Clears the guest cookie (e.g. after merging a guest into a real account). */
export async function clearGuestCookie(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_COOKIE);
}
