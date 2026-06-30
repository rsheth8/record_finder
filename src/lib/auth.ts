import NextAuth from "next-auth";
import Spotify from "next-auth/providers/spotify";

const spotifyConfigured =
  Boolean(process.env.SPOTIFY_CLIENT_ID) &&
  Boolean(process.env.SPOTIFY_CLIENT_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: spotifyConfigured
    ? [
        Spotify({
          clientId: process.env.SPOTIFY_CLIENT_ID,
          clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
          authorization: {
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
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
});

export const isSpotifyConfigured = spotifyConfigured;
