import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.discogs.com" },
      { protocol: "https", hostname: "img.discogs.com" },
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "st.discogs.com" },
    ],
  },
};

export default nextConfig;
