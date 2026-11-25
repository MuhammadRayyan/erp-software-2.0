"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const LIVE_REFRESH_CHANNEL = "uae-manager-live-sync";

/**
 * Broadcast an immediate invalidation message across all open browser tabs
 * in the same origin (e.g. after issuing or revising a document).
 */
export function broadcastLiveRefresh() {
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(LIVE_REFRESH_CHANNEL);
      channel.postMessage({ type: "refresh", timestamp: Date.now() });
      channel.close();
    } catch {
      // BroadcastChannel unavailable in current environment
    }
  }
}

export function useLiveRefresh(options?: {
  intervalMs?: number;
  refreshOnMount?: boolean;
  minStaleMs?: number;
}) {
  const router = useRouter();
  const { intervalMs = 0, refreshOnMount = true, minStaleMs = 60_000 } = options ?? {};
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    if (!refreshOnMount && lastRefreshRef.current === 0) {
      lastRefreshRef.current = Date.now();
    }
    const triggerRefresh = (force = false) => {
      const now = Date.now();
      // Throttle rapid consecutive events within 1 second
      if (lastRefreshRef.current > 0 && now - lastRefreshRef.current < 1000) return;
      // Passive focus/visibility/pageshow triggers only refresh when the view has aged past minStaleMs
      if (!force && lastRefreshRef.current > 0 && now - lastRefreshRef.current < minStaleMs) return;
      lastRefreshRef.current = now;
      router.refresh();
    };

    if (refreshOnMount) {
      triggerRefresh(true);
    }

    const onFocus = () => {
      triggerRefresh(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh(false);
      }
    };

    const onPageShow = () => {
      triggerRefresh(false);
    };

    const onPopState = () => {
      triggerRefresh(true);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);

    let channel: BroadcastChannel | undefined;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(LIVE_REFRESH_CHANNEL);
        channel.onmessage = () => {
          triggerRefresh(true);
        };
      }
    } catch {
      // Ignore BroadcastChannel setup error
    }

    let intervalId: NodeJS.Timeout | undefined;
    if (intervalMs > 0) {
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          triggerRefresh(true);
        }
      }, intervalMs);
    }

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
      if (channel) {
        channel.close();
      }
      if (intervalId) clearInterval(intervalId);
    };
  }, [router, intervalMs, refreshOnMount, minStaleMs]);
}
