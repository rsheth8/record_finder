"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const LINK_CLASSES =
  "focus-ring mb-6 inline-flex items-center gap-1 rounded-sm text-sm text-muted transition-colors hover:text-foreground";

// No event to subscribe to — history.length is read once and doesn't need to
// stay reactive for this component's lifetime. useSyncExternalStore is used
// purely for its SSR-safe getServerSnapshot, matching the pattern elsewhere
// in this app (e.g. useReducedMotion) that avoids a hydration mismatch from
// a browser-only check like `typeof window !== "undefined"` in render.
function subscribe() {
  return () => {};
}

function getSnapshot() {
  return window.history.length > 1;
}

function getServerSnapshot() {
  return false;
}

/** Album pages are now reachable from Discover, Search, and Wishlist — a
 * hardcoded "Back to Discover" link is wrong for the other two. Go back in
 * history when there's somewhere to go back to (preserves the referring
 * page's state, e.g. Search's query and results); otherwise fall back to
 * Discover, since that's still the most likely direct-link entry point. */
export function BackLink() {
  const router = useRouter();
  const hasHistory = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (hasHistory) {
    return (
      <button type="button" onClick={() => router.back()} className={LINK_CLASSES}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
    );
  }

  return (
    <Link href="/discover" className={LINK_CLASSES}>
      <ArrowLeft className="h-4 w-4" />
      Back to Discover
    </Link>
  );
}
