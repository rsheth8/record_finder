"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Compass, Coins, Heart, Home, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const tabs = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/search", label: "Search", icon: Search, exact: false },
  { href: "/discover", label: "Discover", icon: Compass, exact: false },
  { href: "/wishlist", label: "Wishlist", icon: Heart, exact: false },
  { href: "/credits", label: "Credits", icon: Coins, exact: false },
];

export function MobileNav() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  if (pathname.startsWith("/album/")) return null;

  return (
    <nav
      className="mobile-action-bar fixed bottom-0 left-0 right-0 z-30 md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch px-1 py-1.5">
        {tabs.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "pressable focus-ring relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium",
                active ? "text-accent" : "text-muted",
              )}
            >
              {active &&
                (reducedMotion ? (
                  <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" />
                ) : (
                  <motion.span
                    layoutId="mobile-nav-indicator"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                ))}
              <Icon className="h-5 w-5" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
