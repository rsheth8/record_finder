"use client";

import { useSyncExternalStore } from "react";

/** No "current time" exists on the server, so SSR/first-paint render with this
 * sentinel and callers treat it as "not ready yet" — avoids a hydration
 * mismatch from the server and client computing different instants. */
const SERVER_SNAPSHOT = -1;

function subscribe(callback: () => void) {
  const interval = setInterval(callback, 60_000);
  return () => clearInterval(interval);
}

/** Minute-bucketed timestamp, not a fresh `Date` each call — useSyncExternalStore
 * compares snapshots with `Object.is`, so a new object every render would loop. */
function getSnapshot() {
  return Math.floor(Date.now() / 60_000);
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/** The current time, rounded to the minute, ticking every 60s. `null` until
 * the client has mounted (see {@link SERVER_SNAPSHOT}). */
export function useNowMinute(): Date | null {
  const minuteBucket = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return minuteBucket === SERVER_SNAPSHOT ? null : new Date(minuteBucket * 60_000);
}
