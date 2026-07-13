"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Only rendered for a signed-in session — the real access control is
 * server-side (see src/lib/admin.ts, checked in the page itself), this is
 * just avoiding showing an internal-only link to guests. A signed-in
 * non-admin seeing the link isn't a real exposure since the page 404s for
 * them anyway. */
export function DashboardNavLink() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const active = pathname.startsWith("/dashboard");

  if (!session?.user) return null;

  return (
    <Link
      href="/dashboard"
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-accent-muted text-accent"
          : "text-muted hover:bg-surface-elevated hover:text-foreground",
      )}
    >
      <BarChart3 className="h-4 w-4" />
      <span className="hidden sm:inline">Metrics</span>
    </Link>
  );
}
