"use client";

import { AmbientBackground } from "@/components/ambient-background";
import { NoirAtmosphere } from "@/components/noir/noir-atmosphere";
import { AppNav } from "@/components/app-nav";
import { MobileNav } from "@/components/mobile-nav";
import { PageTransition } from "@/components/motion/page-transition";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col bg-background text-foreground">
      <NoirAtmosphere />
      <AmbientBackground />
      <AppNav />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:py-8 md:pb-8">
        <PageTransition>{children}</PageTransition>
      </main>
      <MobileNav />
    </div>
  );
}
