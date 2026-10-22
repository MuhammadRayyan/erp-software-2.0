"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function useLiveRefresh(options?: { intervalMs?: number; refreshOnMount?: boolean }) {
  const router = useRouter();
  const { intervalMs = 0, refreshOnMount = false } = options ?? {};
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    const triggerRefresh = () => {
      // Throttle rapid consecutive events within 1 second
      const now = Date.now();
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

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        triggerRefresh();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

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
      if (intervalId) clearInterval(intervalId);
    };
  }, [router, intervalMs, refreshOnMount]);
}
