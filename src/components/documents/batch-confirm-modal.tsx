"use client";

import { AlertTriangle, CheckCircle, LoaderCircle } from "lucide-react";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function BatchConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmTone = "primary",
  itemCount,
  itemLabel,
  onConfirm,
  isPending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone?: "danger" | "primary" | "warning";
  itemCount: number;
  itemLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          {confirmTone === "danger" ? (
            <AlertTriangle className="size-5 text-danger" />
          ) : (
            <CheckCircle className="size-5 text-primary" />
          )}
          {title}
        </DialogTitle>
        <DialogDescription>
          {description}
        </DialogDescription>

        <div className="mt-4 rounded-lg border border-border bg-surface-raised p-3 text-xs">
          <p className="text-muted-foreground">
            Target: <span className="font-semibold text-foreground">{itemCount} {itemLabel}</span>
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmTone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={isPending}
            className="gap-1.5"
          >
            {isPending && <LoaderCircle className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
