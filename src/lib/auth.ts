import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";
import type { JWT } from "next-auth/jwt";
import { readGuestId, clearGuestCookie } from "@/lib/guest-cookie";
import { mergeGuestData } from "@/lib/db/queries";

function ensureAuthUrl() {
  if (process.env.AUTH_URL) return;

  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;

  if (host) {
    process.env.AUTH_URL = `https://${host}`;
  }
}

ensureAuthUrl();

const spotifyConfigured =
  Boolean(process.env.SPOTIFY_CLIENT_ID) &&
  Boolean(process.env.SPOTIFY_CLIENT_SECRET);

async function refreshSpotifyToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken as string,
      }),
    });

    if (!res.ok) throw new Error("Spotify token refresh failed");

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: spotifyConfigured
    ? [
        Spotify({
          clientId: process.env.SPOTIFY_CLIENT_ID,
          clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
          authorization: {
            url: "https://accounts.spotify.com/authorize",
            params: {
              scope:
                "user-top-read user-read-recently-played user-library-read",
            },
          },
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;

        // First sign-in: adopt anything the visitor did as a guest, then retire
        // the guest cookie. Best-effort — never block sign-in on a merge failure.
        if (token.sub) {
          try {
            const guestId = await readGuestId();
            if (guestId) {
              await mergeGuestData(guestId, token.sub);
              await clearGuestCookie();
            }
          } catch {
            // Ignore — the user is still signed in; guest data just isn't merged.
          }
        }

        return token;
      }

      if (!token.refreshToken) return token;

      // Refresh a minute before actual expiry to avoid races with in-flight requests.
      if (token.expiresAt && Date.now() / 1000 < token.expiresAt - 60) {
        return token;
      }

      return refreshSpotifyToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as "RefreshAccessTokenError" | undefined;
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export const isSpotifyConfigured = spotifyConfigured;
