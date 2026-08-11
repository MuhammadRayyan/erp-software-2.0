"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const DialogRoot = Dialog.Root;
export const DialogTrigger = Dialog.Trigger;
export const DialogClose = Dialog.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof Dialog.Content>) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/45 data-[state=open]:animate-in" />
      <Dialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-surface-raised p-5 shadow-[0_24px_64px_rgb(15_23_42/0.22)] outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close aria-label="Close" className="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof Dialog.Title>) {
  return <Dialog.Title className={cn("text-base font-semibold", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof Dialog.Description>) {
  return <Dialog.Description className={cn("mt-1 text-sm leading-6 text-muted-foreground", className)} {...props} />;
}
