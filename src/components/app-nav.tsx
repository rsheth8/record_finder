"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Compass, Disc3, Heart, Home } from "lucide-react";
import { CreditsNavLink } from "@/components/credits/credits-nav-link";
import { ThemePicker } from "@/components/theme-picker";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const navItems = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/discover", label: "Discover", icon: Compass, exact: false },
  { href: "/wishlist", label: "Wishlist", icon: Heart, exact: false },
];

export function AppNav() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  return (
    <header className="sticky top-0 z-30 border-b border-border-subtle bg-[var(--color-nav-bg)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-lg font-semibold text-foreground"
        >
          <motion.div
            animate={reducedMotion ? {} : { rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            <Disc3 className="h-7 w-7 text-accent drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
          </motion.div>
          <span className="hidden sm:inline">Record Finder</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
          <CreditsNavLink />
          <ThemePicker className="ml-2" />
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <CreditsNavLink />
          <ThemePicker />
        </div>
      </div>
    </header>
  );
}
