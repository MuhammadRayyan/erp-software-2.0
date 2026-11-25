import type { ReactNode } from "react";
import type { UseFormRegister } from "react-hook-form";
import type { DocumentLinePreview } from "../document-calculations";

export type ColumnPinnedPosition = "left" | "right";
export type ColumnAlignment = "left" | "center" | "right";

export interface DocumentGridCellContext<TLine = any> {
  index: number;
  line: TLine;
  fieldId: string;
  isLastRow: boolean;
  isFirstRow: boolean;
  preview?: DocumentLinePreview;
  register: UseFormRegister<any>;
  control?: any;
  errors?: any;
  handleKeyDown: (e: React.KeyboardEvent, colId: string) => void;
  currencyCode: string;
  minorUnit: number;
  amountsIncludeTax: boolean;
  duplicateLine?: (index: number) => void;
  removeLine: (index: number) => void;
  moveLineUp?: (index: number) => void;
  moveLineDown?: (index: number) => void;
}

export interface DocumentGridColumnDef<TLine = any> {
  id: string;
  header: ReactNode | (() => ReactNode);
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  pinned?: ColumnPinnedPosition;
  align?: ColumnAlignment;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
  isVisible?: boolean;
  isEditable?: boolean;
  renderCell: (context: DocumentGridCellContext<TLine>) => ReactNode;
}

export interface ParsedTSVRow {
  itemSkuOrName?: string;
  description?: string;
  quantity?: string;
  unitPrice?: string;
  discountType?: "none" | "percentage" | "fixed";
  discountValue?: string;
  rawCells: string[];
}
