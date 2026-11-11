"use client";

import React, { memo, useMemo } from "react";
import type { UseFormRegister } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { cn } from "@/lib/cn";
import {
  previewDocumentLine,
  type DocumentLinePreview,
  type DocumentLineTaxOption,
} from "../document-calculations";
import type {
  DocumentGridColumnDef,
  DocumentGridCellContext,
} from "./document-grid-types";

export interface DocumentGridRowProps<TLine = any> {
  index: number;
  fieldId: string;
  isLastRow: boolean;
  isFirstRow: boolean;
  columns: DocumentGridColumnDef<TLine>[];
  register: UseFormRegister<any>;
  control?: any;
  errors?: any;
  taxCodes?: DocumentLineTaxOption[];
  minorUnit: number;
  currencyCode: string;
  amountsIncludeTax: boolean;
  fallbackLine?: TLine;
  fallbackPreview?: DocumentLinePreview;
  handleKeyDown: (e: React.KeyboardEvent, colId: string) => void;
  duplicateLine?: (index: number) => void;
  removeLine: (index: number) => void;
  moveLineUp?: (index: number) => void;
  moveLineDown?: (index: number) => void;
}

function DocumentGridRowInner<TLine = any>({
  index,
  fieldId,
  isLastRow,
  isFirstRow,
  columns,
  register,
  control,
  errors,
  taxCodes = [],
  minorUnit,
  currencyCode,
  amountsIncludeTax,
  fallbackLine,
  fallbackPreview,
  handleKeyDown,
  duplicateLine,
  removeLine,
  moveLineUp,
  moveLineDown,
}: DocumentGridRowProps<TLine>) {
  // Row-level subscription: only this row re-renders when its own fields change!
  const watchedLine = useWatch({
    control,
    name: `lines.${index}` as any,
  });

  const line = useMemo((): TLine => {
    return (watchedLine ?? fallbackLine ?? {}) as TLine;
  }, [watchedLine, fallbackLine]);

  const calculatedPreview = useMemo(() => {
    return previewDocumentLine(line as any, taxCodes, minorUnit, amountsIncludeTax);
  }, [line, taxCodes, minorUnit, amountsIncludeTax]);

  const preview = control ? calculatedPreview : (fallbackPreview ?? calculatedPreview);

  const cellContext: DocumentGridCellContext<TLine> = {
    index,
    line,
    fieldId,
    isLastRow,
    isFirstRow,
    preview,
    register,
    control,
    errors,
    handleKeyDown,
    currencyCode,
    minorUnit,
    amountsIncludeTax,
    duplicateLine,
    removeLine,
    moveLineUp,
    moveLineDown,
  };

  return (
    <tr
      data-line-index={index}
      className="group transition-colors hover:bg-surface-muted/30"
    >
      {columns.map((col) => {
        const widthStyle: React.CSSProperties = {
          width: typeof col.width === "number" ? `${col.width}px` : col.width,
        };

        return (
          <td
            key={col.id}
            data-col-id={col.id}
            style={widthStyle}
            className={cn(
              "p-1.5 text-xs align-top transition-colors border-b border-border/50 min-w-0 overflow-hidden",
              col.align === "right" && "text-right",
              col.align === "center" && "text-center",
              col.cellClassName
            )}
          >
            {col.renderCell(cellContext)}
          </td>
        );
      })}
    </tr>
  );
}

function areRowPropsEqual(
  prevProps: DocumentGridRowProps<any>,
  nextProps: DocumentGridRowProps<any>
): boolean {
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.fieldId !== nextProps.fieldId) return false;
  if (prevProps.isLastRow !== nextProps.isLastRow) return false;
  if (prevProps.isFirstRow !== nextProps.isFirstRow) return false;
  if (prevProps.columns !== nextProps.columns) return false;
  if (prevProps.amountsIncludeTax !== nextProps.amountsIncludeTax) return false;
  if (prevProps.minorUnit !== nextProps.minorUnit) return false;
  if (prevProps.currencyCode !== nextProps.currencyCode) return false;
  if (prevProps.taxCodes !== nextProps.taxCodes) return false;

  const prevError = (prevProps.errors?.lines as any)?.[prevProps.index];
  const nextError = (nextProps.errors?.lines as any)?.[nextProps.index];
  if (prevError !== nextError) return false;

  if (!nextProps.control) {
    if (prevProps.fallbackLine !== nextProps.fallbackLine) return false;
    if (prevProps.fallbackPreview !== nextProps.fallbackPreview) return false;
  }

  return true;
}

export const DocumentGridRow = memo(DocumentGridRowInner, areRowPropsEqual) as typeof DocumentGridRowInner;
