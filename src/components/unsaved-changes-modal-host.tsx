"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  CONFIRM_LEAVE_EVENT,
  markBypassBeforeUnload,
  type ConfirmLeaveDetail,
} from "@/hooks/use-unsaved-changes";

export function UnsavedChangesModalHost() {
  const router = useRouter();
  const [pendingLeave, setPendingLeave] = useState<ConfirmLeaveDetail | null>(null);

  useEffect(() => {
    const onConfirmLeave = (event: Event) => {
      const custom = event as CustomEvent<ConfirmLeaveDetail>;
      if (custom.detail?.href) {
        setPendingLeave(custom.detail);
      }
    };
    window.addEventListener(CONFIRM_LEAVE_EVENT, onConfirmLeave);
    return () => window.removeEventListener(CONFIRM_LEAVE_EVENT, onConfirmLeave);
  }, []);

  function handleConfirm() {
    if (!pendingLeave) return;
    const next = pendingLeave;
    setPendingLeave(null);
    markBypassBeforeUnload();

    if (next.onConfirm) {
      next.onConfirm();
      return;
    }

    if (next.isSameOrigin) {
      router.push(next.href);
    } else {
      window.location.assign(next.href);
    }
  }

  return (
    <ConfirmDialog
      open={pendingLeave !== null}
      onOpenChange={(open) => {
        if (!open) setPendingLeave(null);
      }}
      tone="warning"
      title="Leave with unsaved changes?"
      description="You have unsaved changes on this page. Leaving now will discard them."
      confirmLabel="Leave page"
      cancelLabel="Stay"
      contentClassName="z-[80]"
      overlayClassName="z-[80]"
      onConfirm={handleConfirm}
    />
  );
}
