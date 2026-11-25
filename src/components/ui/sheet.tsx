"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const SheetRoot = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

/**
 * Right-hand side panel for focused tasks that should keep the current page
 * in view (e.g. recording a payment against the open document).
 */
export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Dialog.Content>) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="erp-overlay-animate fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[1px]" />
      <Dialog.Content
        className={cn(
          "erp-sheet-animate fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface-raised shadow-[0_24px_64px_rgb(15_23_42/0.22)] outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close
          aria-label="Close"
          className="absolute top-3.5 right-3.5 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b border-border px-5 py-4 pr-12", className)} {...props} />;
}

export function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex-1 space-y-4 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border px-5 py-3", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof Dialog.Title>) {
  return <Dialog.Title className={cn("text-base font-semibold", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof Dialog.Description>) {
  return <Dialog.Description className={cn("mt-0.5 text-sm text-muted-foreground", className)} {...props} />;
}
