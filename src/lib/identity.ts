import { auth } from "@/lib/auth";
import { readGuestId, readOrCreateGuestId } from "@/lib/guest-cookie";

/** The current identity for data scoping: the signed-in Spotify user id if
 * present, otherwise the anonymous guest id from the cookie (or null if the
 * visitor has never written anything yet). Read-only — safe in Server Components. */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  return readGuestId();
}

/** Like getCurrentUserId, but mints a guest id (and cookie) when none exists.
 * Only call from a Route Handler or Server Function — it may set a cookie. */
export async function getOrCreateUserId(): Promise<string> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  return readOrCreateGuestId();
}
