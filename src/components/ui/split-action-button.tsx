"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { usePermissionChecker } from "@/components/permissions-provider";
import type { ActionKey, ModuleKey } from "@/core/permissions/module-access";

export interface SplitActionOption {
  label: string;
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
  permission?: ActionKey | ActionKey[];
  permissionModule?: ModuleKey | ModuleKey[];
}

export interface SplitActionButtonProps {
  label: string;
  onPrimaryClick: () => void;
  options: SplitActionOption[];
  permission?: ActionKey | ActionKey[];
  permissionModule?: ModuleKey | ModuleKey[];
  menuAriaLabel?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function SplitActionButton({
  label,
  onPrimaryClick,
  options,
  permission,
  permissionModule,
  menuAriaLabel = "More save options",
  variant = "primary",
  size = "default",
  type = "button",
  disabled = false,
  loading = false,
  className,
}: SplitActionButtonProps) {
  const canPerform = usePermissionChecker();
  if (!canPerform(permission, permissionModule)) return null;

  const visibleOptions = options.filter((opt) =>
    canPerform(opt.permission, opt.permissionModule),
  );
  const isDisabled = disabled || loading;

  if (visibleOptions.length === 0) {
    return (
      <Button
        type={type}
        variant={variant}
        size={size}
        disabled={isDisabled}
        loading={loading}
        onClick={onPrimaryClick}
        className={className}
      >
        {label}
      </Button>
    );
  }

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Button
        type={type}
        variant={variant}
        size={size}
        disabled={isDisabled}
        loading={loading}
        onClick={onPrimaryClick}
        className="rounded-r-none"
      >
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            disabled={isDisabled}
            aria-label={menuAriaLabel}
            className={cn(
              "rounded-l-none px-2",
              variant === "secondary"
                ? "-ml-px border-l border-border"
                : "border-l border-primary-foreground/25",
            )}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {visibleOptions.map((opt) => (
            <DropdownMenuItem
              key={opt.label}
              disabled={opt.disabled || isDisabled}
              onSelect={opt.onSelect}
              className="flex flex-col items-start gap-0.5 py-2"
            >
              <span className="font-medium text-foreground">{opt.label}</span>
              {opt.description ? (
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
