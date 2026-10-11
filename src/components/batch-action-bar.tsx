"use client";

import { CheckSquare, Download, Printer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BatchActionBarProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onSelectAll?: () => void;
  onExportSelected?: () => void;
  onPrintSelected?: () => void;
  onDeleteSelected?: () => void;
  isDeleting?: boolean;
  deleteLabel?: string;
  children?: React.ReactNode;
}

export function BatchActionBar({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAll,
  onExportSelected,
  onPrintSelected,
  onDeleteSelected,
  isDeleting = false,
  deleteLabel = "Delete Selected",
  children,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-3 rounded-xl border border-border-strong bg-surface/95 px-4 py-2.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2 border-r border-border pr-3">
          <CheckSquare className="size-4 text-primary" />
          <span className="text-xs font-semibold">
            {selectedCount} <span className="font-normal text-muted-foreground">of {totalCount} selected</span>
          </span>
          {onSelectAll && selectedCount < totalCount && (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs font-medium text-primary hover:underline"
            >
              Select All
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onExportSelected && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onExportSelected}
              className="h-8 gap-1.5 text-xs"
            >
              <Download className="size-3.5" /> Export CSV
            </Button>
          )}

          {onPrintSelected && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onPrintSelected}
              className="h-8 gap-1.5 text-xs"
            >
              <Printer className="size-3.5" /> Print
            </Button>
          )}

          {children}

          {onDeleteSelected && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={onDeleteSelected}
              disabled={isDeleting}
              className="h-8 gap-1.5 text-xs"
            >
              <Trash2 className="size-3.5" /> {deleteLabel}
            </Button>
          )}
        </div>

        <div className="border-l border-border pl-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClearSelection}
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label="Clear selection"
            title="Clear selection"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
