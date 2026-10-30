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

export function useLiveRefresh(options?: { intervalMs?: number; refreshOnMount?: boolean }) {
  const router = useRouter();
  const { intervalMs = 6000, refreshOnMount = true } = options ?? {};
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    const triggerRefresh = () => {
      const now = Date.now();
      // Throttle rapid consecutive events within 1 second
      if (lastRefreshRef.current > 0 && now - lastRefreshRef.current < 1000) return;
      lastRefreshRef.current = now;
      router.refresh();
    };

    if (refreshOnMount) {
      triggerRefresh();
    }

    const onFocus = () => {
      triggerRefresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    const onPageShow = () => {
      triggerRefresh();
    };

    const onPopState = () => {
      triggerRefresh();
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
          triggerRefresh();
        };
      }
    } catch {
      // Ignore BroadcastChannel setup error
    }

    let intervalId: NodeJS.Timeout | undefined;
    if (intervalMs > 0) {
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") {
          triggerRefresh();
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
  }, [router, intervalMs, refreshOnMount]);
}
