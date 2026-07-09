import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Shared empty/no-results treatment: big ghosted icon on a record shelf,
 * display-font title, one-line explanation, optional action below. Used by
 * Discover's empty shelf, Search's intro and no-results states, and the
 * Wishlist's empty shelf, so they read as one visual language.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  shelf = true,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  /** Show the little shelf line under the icon (skip for non-"shelf" states). */
  shelf?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "stream-fade-in flex flex-col items-center py-16 text-center",
        className,
      )}
    >
      <div className="relative mb-6">
        <Icon className="h-16 w-16 text-muted/40" />
        {shelf && (
          <div className="absolute -bottom-2 left-1/2 h-1 w-20 -translate-x-1/2 rounded-full bg-border" />
        )}
      </div>
      <p className="font-display text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
      {children}
    </div>
  );
}
