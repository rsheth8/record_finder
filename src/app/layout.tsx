import type { Metadata } from "next";
import Script from "next/script";
import {
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Inter,
  Playfair_Display,
  Source_Sans_3,
  Space_Grotesk,
} from "next/font/google";
import { Providers } from "@/components/providers";
import { DEFAULT_THEME } from "@/lib/themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Record Finder",
  description: "Discover vinyl albums based on your taste",
};

const fontVariables = [
  geistSans.variable,
  geistMono.variable,
  instrumentSerif.variable,
  fraunces.variable,
  dmSerifDisplay.variable,
  dmSans.variable,
  spaceGrotesk.variable,
  inter.variable,
  playfairDisplay.variable,
  sourceSans.variable,
].join(" ");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      className={`${fontVariables} h-full antialiased`}
      style={
        {
          "--font-body": "var(--font-geist-sans)",
          "--font-display": "var(--font-fraunces)",
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <Script id="theme-init" strategy="beforeInteractive">
        {`(function(){try{var t=localStorage.getItem("record-finder-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`}
      </Script>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
