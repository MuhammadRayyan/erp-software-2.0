"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
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
  registerAmountsIncludeTax,
  className,
}: DocumentColumnTogglesProps) {
  return (
    <div className={cn("flex flex-col gap-3 pt-2", className)}>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="size-4 rounded-[4px] border-border-strong accent-primary"
          checked={showLineNumber}
          onChange={(e) => onShowLineNumberChange(e.target.checked)}
        />
        Column · Line number
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="size-4 rounded-[4px] border-border-strong accent-primary"
          checked={showDescription}
          onChange={(e) => onShowDescriptionChange(e.target.checked)}
        />
        Column · Description
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="size-4 rounded-[4px] border-border-strong accent-primary"
          checked={showDiscounts}
          onChange={(e) => onShowDiscountsChange(e.target.checked)}
        />
        Column · Discount
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          className="size-4 rounded-[4px] border-border-strong accent-primary"
          checked={showLineProjects}
          onChange={(e) => onShowLineProjectsChange(e.target.checked)}
        />
        Column · Project
      </label>
      {registerAmountsIncludeTax && (
        <label className="flex items-center gap-2 text-sm cursor-pointer mt-2 border-t pt-2 border-border">
          <input
            type="checkbox"
            className="size-4 rounded-[4px] border-border-strong accent-primary"
            {...registerAmountsIncludeTax}
          />
          Amounts are tax inclusive
        </label>
      )}
    </div>
  );
}
