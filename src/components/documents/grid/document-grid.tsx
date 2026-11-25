"use client";

import React, { useRef, useMemo, useCallback } from "react";
import type { UseFormRegister } from "react-hook-form";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DocumentLinePreview, DocumentLineTaxOption } from "../document-calculations";
import type { DocumentGridColumnDef } from "./document-grid-types";
import { DocumentGridRow } from "./document-grid-row";

export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let insideQuotes = false;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "\t" && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if (char === "\n" && !insideQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  // Push last cell & row
  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

export interface DocumentGridProps<TLine = any> {
  columns: DocumentGridColumnDef<TLine>[];
  fields: { id: string }[];
  lines?: TLine[];
  previews?: DocumentLinePreview[];
  register: UseFormRegister<any>;
  control?: any;
  errors?: any;
  taxCodes?: DocumentLineTaxOption[];
  minorUnit: number;
  currencyCode: string;
  amountsIncludeTax?: boolean;
  onAppend: () => void;
  onRemove: (index: number) => void;
  onDuplicate?: (index: number) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onPasteTSV?: (tsvRows: string[][], startRow: number, startColId: string) => void;
  className?: string;
  emptyState?: React.ReactNode;
}

export function DocumentGrid<TLine = any>({
  columns,
  fields,
  lines,
  previews,
  register,
  control,
  errors,
  taxCodes = [],
  minorUnit,
  currencyCode,
  amountsIncludeTax = false,
  onAppend,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onPasteTSV,
  className,
  emptyState,
}: DocumentGridProps<TLine>) {
  "use no memo";
  const containerRef = useRef<HTMLDivElement>(null);
  const VIRTUALIZATION_THRESHOLD = 25;
  const shouldVirtualize = fields.length > VIRTUALIZATION_THRESHOLD;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns imperative layout helpers; component opts out via "use no memo"
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? fields.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 48,
    overscan: 6,
  });

  // Filter visible columns
  const visibleColumns = useMemo(
    () => columns.filter((col) => col.isVisible !== false),
    [columns]
  );



  // Focus helpers for coordinate-based Excel navigation
  const focusCol = useCallback((row: number, targetColId: string) => {
    if (!containerRef.current) return;
    let elem = containerRef.current.querySelector<HTMLElement>(
      `[data-grid-row="${row}"][data-grid-col-id="${targetColId}"]`
    );
    if (!elem && targetColId === "discountValue") {
      elem = containerRef.current.querySelector<HTMLElement>(
        `[data-grid-row="${row}"][data-grid-col-id="discount"]`
      );
    }
    if (!elem) {
      elem = containerRef.current.querySelector<HTMLElement>(`[data-grid-row="${row}"]`);
    }
    if (elem) {
      elem.focus();
      if (elem instanceof HTMLInputElement) elem.select();
    }
  }, []);

  const focusColWithRetry = useCallback((row: number, targetColId: string) => {
    let attempts = 0;
    const tryFocus = () => {
      attempts++;
      let elem = containerRef.current?.querySelector<HTMLElement>(
        `[data-grid-row="${row}"][data-grid-col-id="${targetColId}"]`
      );
      if (!elem && targetColId === "discountValue") {
        elem = containerRef.current?.querySelector<HTMLElement>(
          `[data-grid-row="${row}"][data-grid-col-id="discount"]`
        );
      }
      if (!elem) {
        elem = containerRef.current?.querySelector<HTMLElement>(`[data-grid-row="${row}"]`);
      }
      if (elem) {
        elem.focus();
        if (elem instanceof HTMLInputElement) elem.select();
      } else if (attempts < 8) {
        requestAnimationFrame(tryFocus);
      }
    };
    requestAnimationFrame(tryFocus);
  }, []);

  const focusLastCellOfRow = useCallback((row: number) => {
    const elems = containerRef.current?.querySelectorAll<HTMLElement>(`[data-grid-row="${row}"]`);
    if (elems && elems.length > 0) {
      const target = elems[elems.length - 1];
      target.focus();
      if (target instanceof HTMLInputElement) target.select();
    }
  }, []);

  // Coordinate-based keyboard navigation:
  // - Enter commits and moves DOWN to the same column on the next row (Excel-grade ergonomics)
  // - Shift+Enter moves UP to the same column on the previous row
  // - Tab / Shift-Tab navigates across visible editable inputs within the row and wraps across rows
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, colId: string) => {
      const target = e.currentTarget as HTMLElement;
      const rowAttr = target.getAttribute("data-grid-row");
      const rowIndex = rowAttr ? parseInt(rowAttr, 10) : -1;
      if (rowIndex < 0) return;

      const totalRows = fields.length;

      // Handle Enter and Shift+Enter
      if (e.key === "Enter" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        // Only intercept Enter for INPUT, SELECT, or the item-picker trigger button.
        // Plain action buttons (like Delete or More Actions) must retain native Enter activation!
        const isGridInteractive =
          target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          (target.tagName === "BUTTON" && target.getAttribute("data-grid-col-id") === "item");

        if (isGridInteractive) {
          e.preventDefault();
          const targetColId = target.getAttribute("data-grid-col-id") || colId;

          if (e.shiftKey) {
            // Shift+Enter: Move UP to same column on previous row
            if (rowIndex > 0) {
              focusCol(rowIndex - 1, targetColId);
            }
          } else {
            // Enter: Move DOWN to same column on next row
            if (rowIndex === totalRows - 1) {
              onAppend();
              if (totalRows + 1 > VIRTUALIZATION_THRESHOLD) {
                requestAnimationFrame(() => rowVirtualizer.scrollToIndex(rowIndex + 1));
              }
              focusColWithRetry(rowIndex + 1, targetColId);
            } else {
              if (shouldVirtualize) {
                rowVirtualizer.scrollToIndex(rowIndex + 1);
                focusColWithRetry(rowIndex + 1, targetColId);
              } else {
                focusCol(rowIndex + 1, targetColId);
              }
            }
          }
          return;
        }
      }

      // Handle Tab and Shift+Tab
      if (e.key === "Tab") {
        const rowElements = Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>(`[data-grid-row="${rowIndex}"]`) ?? []
        );
        const currentCellIndex = rowElements.indexOf(target);
        if (currentCellIndex === -1) return;

        if (!e.shiftKey) {
          // Tab forward
          if (currentCellIndex < rowElements.length - 1) {
            // Move to next cell in same row
            e.preventDefault();
            const nextElem = rowElements[currentCellIndex + 1];
            nextElem.focus();
            if (nextElem instanceof HTMLInputElement) nextElem.select();
          } else {
            // Last cell of row -> wrap to first cell of next row; exit naturally on final row
            if (rowIndex === totalRows - 1) {
              return;
            }
            e.preventDefault();
            const nextRowElems = containerRef.current?.querySelectorAll<HTMLElement>(
              `[data-grid-row="${rowIndex + 1}"]`
            );
            const targetCell = nextRowElems?.[0];
            if (targetCell) {
              targetCell.focus();
              if (targetCell instanceof HTMLInputElement) targetCell.select();
            }
          }
        } else {
          // Shift+Tab backward
          if (currentCellIndex > 0) {
            e.preventDefault();
            const prevElem = rowElements[currentCellIndex - 1];
            prevElem.focus();
            if (prevElem instanceof HTMLInputElement) prevElem.select();
          } else if (rowIndex > 0) {
            e.preventDefault();
            focusLastCellOfRow(rowIndex - 1);
          }
        }
      }
    },
    [fields.length, onAppend, focusCol, focusColWithRetry, focusLastCellOfRow, rowVirtualizer, shouldVirtualize]
  );

  // Multi-row TSV clipboard paste handler for Excel / Google Sheets
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text || (!text.includes("\t") && !text.includes("\n"))) {
        return; // Single value paste, let default input handler proceed
      }

      const rows = parseTSV(text);
      if (rows.length === 0) return;

      // Skip header row if copied with table headers
      if (rows.length > 1) {
        const firstCell = rows[0][0]?.toLowerCase() ?? "";
        const secondCell = rows[0][1]?.toLowerCase() ?? "";
        if (
          firstCell === "item" ||
          firstCell === "sku" ||
          firstCell === "description" ||
          firstCell === "product" ||
          firstCell === "name" ||
          secondCell === "qty" ||
          secondCell === "quantity" ||
          secondCell === "description"
        ) {
          rows.shift();
        }
      }

      const activeElement = document.activeElement;
      const startRow = activeElement
        ? parseInt(activeElement.getAttribute("data-grid-row") || "0", 10)
        : 0;
      const startColId =
        activeElement?.getAttribute("data-grid-col-id") ||
        (visibleColumns.find((c) => c.id === "description") ? "description" : "item");

      e.preventDefault();

      if (onPasteTSV) {
        onPasteTSV(rows, startRow, startColId);
      }
    },
    [onPasteTSV, visibleColumns]
  );

  const virtualItems = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className={cn("w-full min-w-0 space-y-3", className)}>
      <div
        ref={containerRef}
        onPaste={handlePaste}
        className={cn(
          "relative w-full min-w-0 overflow-x-auto rounded-lg border border-border/80 bg-surface shadow-xs",
          shouldVirtualize && "max-h-[540px] overflow-y-auto"
        )}
      >
        <table className="line-item-table w-full min-w-[780px] table-fixed border-collapse text-left">
          <colgroup>
            {visibleColumns.map((col) => {
              const widthStyle: React.CSSProperties = {
                width: typeof col.width === "number" ? `${col.width}px` : col.width,
              };
              return <col key={col.id} style={widthStyle} />;
            })}
          </colgroup>
          <thead>
            <tr
              className={cn(
                "border-b border-border/80 bg-surface-muted/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground select-none",
                shouldVirtualize && "sticky top-0 z-10 bg-surface-muted/95 backdrop-blur-xs"
              )}
            >
              {visibleColumns.map((col) => {
                const widthStyle: React.CSSProperties = {
                  width: typeof col.width === "number" ? `${col.width}px` : col.width,
                };
                return (
                  <th
                    key={col.id}
                    style={widthStyle}
                    className={cn(
                      "py-2 px-2 font-semibold truncate",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.headerClassName
                    )}
                  >
                    {typeof col.header === "function" ? col.header() : col.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {fields.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="py-8 text-center text-xs text-muted-foreground italic"
                >
                  {emptyState ?? "No lines added yet. Click 'Add line' below to start."}
                </td>
              </tr>
            ) : shouldVirtualize ? (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleColumns.length} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const index = virtualRow.index;
                  const field = fields[index];
                  if (!field) return null;
                  return (
                    <DocumentGridRow
                      key={field.id}
                      index={index}
                      virtualIndex={virtualRow.index}
                      measureRef={rowVirtualizer.measureElement}
                      fieldId={field.id}
                      isLastRow={index === fields.length - 1}
                      isFirstRow={index === 0}
                      columns={visibleColumns}
                      register={register}
                      control={control}
                      errors={errors}
                      taxCodes={taxCodes}
                      minorUnit={minorUnit}
                      currencyCode={currencyCode}
                      amountsIncludeTax={amountsIncludeTax}
                      fallbackLine={lines?.[index]}
                      fallbackPreview={previews?.[index]}
                      handleKeyDown={handleKeyDown}
                      duplicateLine={onDuplicate}
                      removeLine={onRemove}
                      moveLineUp={onMoveUp}
                      moveLineDown={onMoveDown}
                    />
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleColumns.length} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            ) : (
              fields.map((field, index) => (
                <DocumentGridRow
                  key={field.id}
                  index={index}
                  fieldId={field.id}
                  isLastRow={index === fields.length - 1}
                  isFirstRow={index === 0}
                  columns={visibleColumns}
                  register={register}
                  control={control}
                  errors={errors}
                  taxCodes={taxCodes}
                  minorUnit={minorUnit}
                  currencyCode={currencyCode}
                  amountsIncludeTax={amountsIncludeTax}
                  fallbackLine={lines?.[index]}
                  fallbackPreview={previews?.[index]}
                  handleKeyDown={handleKeyDown}
                  duplicateLine={onDuplicate}
                  removeLine={onRemove}
                  moveLineUp={onMoveUp}
                  moveLineDown={onMoveDown}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className="dashed-add-button"
        onClick={() => {
          const nextIndex = fields.length;
          onAppend();
          if (fields.length + 1 > VIRTUALIZATION_THRESHOLD) {
            requestAnimationFrame(() => rowVirtualizer.scrollToIndex(nextIndex));
          }
        }}
      >
        <Plus className="size-4" /> Add line
      </button>
    </div>
  );
}
