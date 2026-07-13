import "next-auth";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError";
    /** Space-separated OAuth scopes granted at sign-in (Spotify's `account.scope`).
     * Not updated by token refreshes — see src/lib/auth.ts. Used to detect
     * whether an already-connected user needs to re-consent for a scope added
     * after they first signed in (e.g. playlist-read-private). */
    scope?: string;
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: "RefreshAccessTokenError";
    scope?: string;
  }
}
