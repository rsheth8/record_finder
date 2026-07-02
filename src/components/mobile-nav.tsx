"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Coins, Heart, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/discover", label: "Discover", icon: Compass, exact: false },
  { href: "/wishlist", label: "Wishlist", icon: Heart, exact: false },
  { href: "/credits", label: "Credits", icon: Coins, exact: false },
];

export function MobileNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/album/")) return null;

  return (
    <nav
      className="mobile-action-bar fixed bottom-0 left-0 right-0 z-30 md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-2">
        {tabs.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-[4rem] flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors",
                active ? "text-accent" : "text-muted",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-accent")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
