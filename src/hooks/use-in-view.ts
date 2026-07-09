"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Fires `onEnter` every time the returned ref's element enters the viewport
 * (not just once) — callers gate re-entrancy themselves (e.g. a `loading` or
 * `hasMore` flag) since "scrolled past the sentinel again" is a legitimate
 * re-trigger for infinite-scroll-style consumers. `rootMargin` lets the
 * fetch start before the element is actually on screen, so content is
 * usually already loaded by the time the user scrolls to it.
 *
 * Returns a *callback* ref, not a plain object ref — some callers only
 * render the sentinel element once an initial fetch has resolved (e.g.
 * Search's sentinel is gated behind `pagination` existing), so the element
 * often doesn't exist yet on the render where this hook is first called. An
 * object ref's `.current` wouldn't be picked up until some *other* dependency
 * happened to change; a callback ref re-attaches the observer the instant the
 * element actually mounts.
 *
 * `resetKey` should change every time the caller successfully handles an
 * `onEnter` (e.g. a counter bumped after each load). IntersectionObserver
 * only calls back on a threshold *crossing* — with a generous `rootMargin`
 * the sentinel is often still fully inside that margin both before and after
 * new content is inserted above it (ratio stays pinned at 1), so no new
 * crossing ever happens and a naive version of this hook fires once and goes
 * silent. Disconnecting and re-observing on `resetKey` forces a fresh check
 * (an observer's first `observe()` call always queues an immediate
 * notification), so a continuous scroll keeps cascading through consecutive
 * loads instead of stalling after the first. */
export function useInView<T extends HTMLElement>(
  onEnter: () => void,
  { rootMargin = "800px", resetKey }: { rootMargin?: string; resetKey?: unknown } = {},
) {
  const [node, setNode] = useState<T | null>(null);
  const ref = useCallback((el: T | null) => setNode(el), []);

  const onEnterRef = useRef(onEnter);
  useEffect(() => {
    onEnterRef.current = onEnter;
  });

  useEffect(() => {
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onEnterRef.current();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rootMargin, resetKey]);

  return ref;
}
