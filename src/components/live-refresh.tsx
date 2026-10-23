"use client";

import { useLiveRefresh } from "./use-live-refresh";

export function LiveRefresh({
  intervalMs = 6000,
  refreshOnMount = true,
}: {
  intervalMs?: number;
  refreshOnMount?: boolean;
} = {}) {
  useLiveRefresh({ intervalMs, refreshOnMount });
  return null;
}
