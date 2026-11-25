"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useDialogPortalContainer } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 4, collisionPadding = 8, ...props }, ref) => {
  const container = useDialogPortalContainer();
  return (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "erp-popover-animate z-[70] w-72 rounded-[8px] border border-border-strong bg-surface-raised p-0 text-foreground shadow-[0_12px_32px_rgb(15_23_42/0.14)] outline-none dark:shadow-[0_14px_36px_rgb(0_0_0/0.45)]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
