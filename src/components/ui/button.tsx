"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useActionPermission } from "@/components/permissions-provider";
import type { ActionKey, ModuleKey } from "@/core/permissions/module-access";

const buttonVariants = cva(
  "inline-flex h-9 items-center justify-center gap-2 rounded-[6px] px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border border-border-strong bg-surface-raised text-foreground hover:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted",
        danger: "bg-danger text-danger-foreground hover:bg-danger/90",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5 text-[13px]",
        lg: "h-10 px-4",
        icon: "size-9 px-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    permission?: ActionKey | ActionKey[];
    permissionModule?: ModuleKey | ModuleKey[];
  };

export function Button({
  className,
  variant,
  size,
  asChild,
  loading = false,
  disabled,
  permission,
  permissionModule,
  children,
  ...props
}: ButtonProps) {
  const allowed = useActionPermission(permission, permissionModule);
  if (!allowed) return null;
  if (asChild) {
    const isBlocked = Boolean(disabled || loading);
    return (
      <Slot
        className={cn(
          buttonVariants({ variant, size }),
          isBlocked && "pointer-events-none opacity-50",
          className,
        )}
        aria-disabled={isBlocked || undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {children}
      </Slot>
    );
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export { buttonVariants };
