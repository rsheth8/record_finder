"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disc3, Compass, ClipboardList, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", icon: Disc3 },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/quiz", label: "Quiz", icon: ClipboardList },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-50">
          <Disc3 className="h-6 w-6 text-violet-400" />
          Record Finder
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-violet-600/20 text-violet-300"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
