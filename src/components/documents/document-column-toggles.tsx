"use client";

import { Controller, type Control, type FieldValues, type Path, type UseFormRegisterReturn } from "react-hook-form";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

export interface DocumentColumnTogglesProps<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
> {
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
  control?: Control<TFieldValues, TContext, TTransformedValues>;
  amountsIncludeTax?: boolean;
  onAmountsIncludeTaxChange?: (checked: boolean) => void;
  showAmountsIncludeTaxToggle?: boolean;
  registerAmountsIncludeTax?: UseFormRegisterReturn;
  className?: string;
}

export function DocumentColumnToggles<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  TTransformedValues = TFieldValues,
>({
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
  control,
  amountsIncludeTax,
  onAmountsIncludeTaxChange,
  showAmountsIncludeTaxToggle = false,
  registerAmountsIncludeTax,
  className,
}: DocumentColumnTogglesProps<TFieldValues, TContext, TTransformedValues>) {
  const renderTaxInclusiveToggle = () => {
    if (onAmountsIncludeTaxChange !== undefined && amountsIncludeTax !== undefined) {
      return (
        <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
          <Checkbox
            checked={amountsIncludeTax}
            onCheckedChange={(checked) => onAmountsIncludeTaxChange(Boolean(checked))}
            aria-label="Amounts are tax inclusive"
          />
          <span>Amounts are tax inclusive</span>
        </label>
      );
    }

    if (control && (showAmountsIncludeTaxToggle || registerAmountsIncludeTax)) {
      return (
        <Controller
          control={control as unknown as Control<FieldValues>}
          name={"amountsIncludeTax" as Path<FieldValues>}
          render={({ field }) => (
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
              <Checkbox
                checked={Boolean(field.value)}
                onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                aria-label="Amounts are tax inclusive"
              />
              <span>Amounts are tax inclusive</span>
            </label>
          )}
        />
      );
    }

    if (registerAmountsIncludeTax) {
      return (
        <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="size-4 rounded-[4px] border-border-strong accent-primary cursor-pointer"
            {...registerAmountsIncludeTax}
          />
          <span>Amounts are tax inclusive</span>
        </label>
      );
    }

    return null;
  };

  const taxToggle = renderTaxInclusiveToggle();

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-surface-muted/20 px-3.5 py-2 transition-all",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {taxToggle ?? (
          <span className="text-xs font-medium text-muted-foreground">Line item display</span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="sm" className="h-7 gap-1.5 text-xs">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <span>Line columns</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 p-2">
          <DropdownMenuLabel className="px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Visible Line Columns
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="space-y-2 px-1.5 py-1.5">
            <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
              <Checkbox
                checked={showLineNumber}
                onCheckedChange={(checked) => onShowLineNumberChange(Boolean(checked))}
                aria-label="Column Line number"
              />
              <span>Column · Line number</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
              <Checkbox
                checked={showDescription}
                onCheckedChange={(checked) => onShowDescriptionChange(Boolean(checked))}
                aria-label="Column Description"
              />
              <span>Column · Description</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
              <Checkbox
                checked={showDiscounts}
                onCheckedChange={(checked) => onShowDiscountsChange(Boolean(checked))}
                aria-label="Column Discount"
              />
              <span>Column · Discount</span>
            </label>

            {onShowLineTaxCodesChange && showLineTaxCodes !== undefined && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
                <Checkbox
                  checked={showLineTaxCodes}
                  onCheckedChange={(checked) => onShowLineTaxCodesChange(Boolean(checked))}
                  aria-label="Column Tax code"
                />
                <span>Column · Tax code</span>
              </label>
            )}

            <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors">
              <Checkbox
                checked={showLineProjects}
                onCheckedChange={(checked) => onShowLineProjectsChange(Boolean(checked))}
                aria-label="Column Project"
              />
              <span>Column · Project</span>
            </label>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
