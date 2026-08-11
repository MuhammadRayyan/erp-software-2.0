"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;
export const DropdownMenuGroup = Dropdown.Group;
export const DropdownMenuPortal = Dropdown.Portal;
export const DropdownMenuSub = Dropdown.Sub;
export const DropdownMenuRadioGroup = Dropdown.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 text-foreground shadow-[0_12px_32px_rgb(15_23_42/0.14)] data-[state=open]:animate-in",
          className,
        )}
        {...props}
      />
    </Dropdown.Portal>
  );
}

export function DropdownMenuItem({ className, inset, ...props }: React.ComponentProps<typeof Dropdown.Item> & { inset?: boolean }) {
  return (
    <Dropdown.Item
      className={cn(
        "relative flex h-8 cursor-default select-none items-center gap-2 rounded-[5px] px-2 text-[13px] outline-none focus:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Dropdown.Label>) {
  return <Dropdown.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Dropdown.Separator>) {
  return <Dropdown.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof Dropdown.RadioItem>) {
  return (
    <Dropdown.RadioItem
      className={cn(
        "relative flex h-8 cursor-default select-none items-center rounded-[5px] py-1.5 pr-2 pl-8 text-[13px] outline-none focus:bg-surface-muted",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <Dropdown.ItemIndicator><Check className="size-3.5" /></Dropdown.ItemIndicator>
      </span>
      {children}
    </Dropdown.RadioItem>
  );
}

export function DropdownMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof Dropdown.SubTrigger>) {
  return (
    <Dropdown.SubTrigger className={cn("flex h-8 items-center rounded-[5px] px-2 text-[13px] outline-none focus:bg-surface-muted", className)} {...props}>
      {children}<ChevronRight className="ml-auto size-4" />
    </Dropdown.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof Dropdown.SubContent>) {
  return <Dropdown.SubContent className={cn("min-w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg", className)} {...props} />;
}
