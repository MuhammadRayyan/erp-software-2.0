"use client";

import { useEffect } from "react";

export const CONFIRM_LEAVE_EVENT = "erp:confirm-leave";
let bypassBeforeUnload = false;
let activeDirtyForms = 0;

export type ConfirmLeaveDetail = {
  href: string;
  isSameOrigin: boolean;
  onConfirm?: () => void;
};

export function markBypassBeforeUnload() {
  bypassBeforeUnload = true;
  window.setTimeout(() => {
    bypassBeforeUnload = false;
  }, 500);
}

export function requestGuardedNavigation(href: string, navigate: () => void) {
  if (typeof window === "undefined" || activeDirtyForms <= 0) {
    navigate();
    return;
  }
  window.dispatchEvent(
    new CustomEvent<ConfirmLeaveDetail>(CONFIRM_LEAVE_EVENT, {
      detail: { href, isSameOrigin: true, onConfirm: navigate },
    }),
  );
}

/**
 * Warns users about unsaved changes when navigating away or closing the tab.
 * Hooks into `beforeunload` (browser refresh/close) and client anchor navigation
 * via the in-app `<UnsavedChangesModalHost />`.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    activeDirtyForms += 1;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (bypassBeforeUnload) return;
      e.preventDefault();
      e.returnValue = "";
    };

    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!(e.target instanceof Element)) return;
      const target = e.target.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }
      if (target.target.toLowerCase() === "_blank" || target.hasAttribute("download")) return;

      let isSameOrigin = href.startsWith("/");
      let targetHref = href;
      try {
        const parsed = new URL(target.href, window.location.href);
        if (parsed.href === window.location.href) return;
        isSameOrigin = parsed.origin === window.location.origin;
        if (isSameOrigin) {
          targetHref = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      } catch {
        // Keep raw href fallback
      }

      e.preventDefault();
      e.stopPropagation();

      window.dispatchEvent(
        new CustomEvent<ConfirmLeaveDetail>(CONFIRM_LEAVE_EVENT, {
          detail: { href: targetHref, isSameOrigin },
        }),
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      activeDirtyForms = Math.max(0, activeDirtyForms - 1);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [isDirty]);
}
