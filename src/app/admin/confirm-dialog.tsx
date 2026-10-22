"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "secondary";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-foreground">{title}</DialogTitle>
            <DialogDescription className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </DialogDescription>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant}
            size="sm"
            disabled={isLoading}
            onClick={onConfirm}
            className="gap-1.5"
          >
            {isLoading && <LoaderCircle className="size-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
