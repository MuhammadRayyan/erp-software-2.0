"use client";

import * as React from "react";
import { AlertTriangle, HelpCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/components/form-error";
import { cn } from "@/lib/cn";

export type ConfirmDialogTone = "danger" | "warning" | "primary";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  pending?: boolean;
  error?: string;
  contentClassName?: string;
  overlayClassName?: string;
  onConfirm: () => void | Promise<void>;
}

const TONE_ICON_STYLES: Record<ConfirmDialogTone, string> = {
  danger: "bg-danger/12 text-danger",
  warning: "bg-warning/15 text-warning",
  primary: "bg-primary/12 text-primary",
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  pending = false,
  error,
  contentClassName,
  overlayClassName,
  onConfirm,
}: ConfirmDialogProps) {
  const Icon =
    tone === "danger"
      ? ShieldAlert
      : tone === "warning"
        ? AlertTriangle
        : HelpCircle;

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent
        role="alertdialog"
        className={contentClassName}
        overlayClassName={overlayClassName}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className="flex items-start gap-3.5 pr-6">
          <div
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
              TONE_ICON_STYLES[tone],
            )}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4">
            <FormError message={error} />
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "danger" : "primary"}
            loading={pending}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

export type ConfirmDialogRequest = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  onConfirm: () => void | Promise<void>;
};

export function useConfirmDialog() {
  const [request, setRequest] = React.useState<ConfirmDialogRequest | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const pendingRef = React.useRef(false);

  const ask = React.useCallback((next: ConfirmDialogRequest) => {
    pendingRef.current = false;
    setError("");
    setPending(false);
    setRequest(next);
  }, []);

  const close = React.useCallback(() => {
    if (!pendingRef.current && !pending) {
      setError("");
      setRequest(null);
    }
  }, [pending]);

  const handleConfirm = React.useCallback(async () => {
    if (!request || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await request.onConfirm();
      setRequest(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [request]);

  const dialog = request ? (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={request.title}
      description={request.description}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      tone={request.tone}
      pending={pending}
      error={error}
      onConfirm={handleConfirm}
    />
  ) : null;

  return { ask, close, dialog };
}
