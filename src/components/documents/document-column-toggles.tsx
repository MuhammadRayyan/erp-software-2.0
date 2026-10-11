"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DocumentColumnTogglesProps {
  showLineNumber: boolean;
  onShowLineNumberChange: (show: boolean) => void;
  showDescription: boolean;
  onShowDescriptionChange: (show: boolean) => void;
  showDiscounts: boolean;
  onShowDiscountsChange: (show: boolean) => void;
  showLineProjects: boolean;
  onShowLineProjectsChange: (show: boolean) => void;
  showLineTaxCodes?: boolean;
  onShowLineTaxCodesChange?: (show: boolean) => void;
  registerAmountsIncludeTax?: UseFormRegisterReturn;
  className?: string;
}

export function DocumentColumnToggles({
  showLineNumber,
  onShowLineNumberChange,
  showDescription,
  onShowDescriptionChange,
  showDiscounts,
  onShowDiscountsChange,
  showLineProjects,
  onShowLineProjectsChange,
  showLineTaxCodes,
  onShowLineTaxCodesChange,
  registerAmountsIncludeTax,
  className,
}: DocumentColumnTogglesProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/80 bg-surface-muted/20 p-3.5 transition-all w-full max-w-lg",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <SlidersHorizontal className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Options & Columns
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
        {registerAmountsIncludeTax && (
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none col-span-full pb-1.5 mb-0.5 border-b border-border/60">
            <input
              type="checkbox"
              className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
              {...registerAmountsIncludeTax}
            />
            <span>Amounts are tax inclusive</span>
          </label>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
          <input
            type="checkbox"
            className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
            checked={showLineNumber}
            onChange={(e) => onShowLineNumberChange(e.target.checked)}
          />
          <span>Column · Line number</span>
        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
          <input
            type="checkbox"
            className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
            checked={showDescription}
            onChange={(e) => onShowDescriptionChange(e.target.checked)}
          />
          <span>Column · Description</span>
        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
          <input
            type="checkbox"
            className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
            checked={showDiscounts}
            onChange={(e) => onShowDiscountsChange(e.target.checked)}
          />
          <span>Column · Discount</span>
        </label>

        {onShowLineTaxCodesChange && showLineTaxCodes !== undefined && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
            <input
              type="checkbox"
              className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
              checked={showLineTaxCodes}
              onChange={(e) => onShowLineTaxCodesChange(e.target.checked)}
            />
            <span>Column · Tax code</span>
          </label>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
          <input
            type="checkbox"
            className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
            checked={showLineProjects}
            onChange={(e) => onShowLineProjectsChange(e.target.checked)}
          />
          <span>Column · Project</span>
        </label>
      </div>
    </div>
  );
}
