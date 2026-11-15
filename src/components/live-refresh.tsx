"use client";

import { useLiveRefresh } from "./use-live-refresh";

export function LiveRefresh({
  intervalMs = 0,
  refreshOnMount = true,
  minStaleMs = 60_000,
}: {
  intervalMs?: number;
  refreshOnMount?: boolean;
  minStaleMs?: number;
} = {}) {
  useLiveRefresh({ intervalMs, refreshOnMount, minStaleMs });
  return null;
}
