import type { Metadata } from "next";
import Script from "next/script";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { DEFAULT_MODE, MODE_STORAGE_KEY } from "@/lib/themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Record Finder",
  description: "Discover vinyl albums based on your taste",
};

const fontVariables = [
  geistSans.variable,
  geistMono.variable,
  fraunces.variable,
].join(" ");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_MODE}
      className={`${fontVariables} h-full antialiased`}
      style={
        {
          "--font-body": "var(--font-geist-sans)",
          "--font-display": "var(--font-fraunces)",
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var m=localStorage.getItem("${MODE_STORAGE_KEY}");if(m)document.documentElement.setAttribute("data-theme",m)}catch(e){}})();`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
