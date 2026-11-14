"use client";

import React, { useState, useMemo, useCallback } from "react";
import type { UseFormRegister, FieldErrors, UseFormRegisterReturn } from "react-hook-form";
import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/core/format";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { cn } from "@/lib/cn";
import type { DocumentLinePreview, DocumentLineTaxOption } from "./document-calculations";
import { DocumentTotalsPanel } from "./document-totals-panel";
import { DocumentColumnToggles } from "./document-column-toggles";
import { SearchableItemSelect } from "./searchable-item-select";
import { DocumentGrid } from "./grid/document-grid";
import type { DocumentGridColumnDef } from "./grid/document-grid-types";
import type { CustomFieldInputDefinition } from "@/modules/custom-fields/custom-field-inputs";

export interface DocumentLineItemOption {
  id: string;
  name: string;
  sku?: string | null;
  salesPriceMinor?: number | null;
  purchasePriceMinor?: number | null;
  salesAccountId?: string;
  inventoryAssetAccountId?: string;
}

export interface DocumentLineAccountOption {
  id: string;
  name: string;
}

export interface DocumentLineProjectOption {
  id: string;
  name: string;
  code?: string;
  customerId?: string | null;
  supplierId?: string | null;
}

export function resolvePastedTSVRow({
  rowCells,
  startColId,
  items,
  minorUnit,
  accountFieldName,
}: {
  rowCells: string[];
  startColId: string;
  items?: DocumentLineItemOption[];
  minorUnit: number;
  accountFieldName: "salesAccountId" | "expenseAccountId";
}) {
  const unquote = (val: string): string => {
    let trimmed = val.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      trimmed = trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed;
  };

  let itemVal = "";
  let descVal = "";
  let qtyVal = "1";
  let priceVal = "0.00";
  let discType: "none" | "percentage" | "fixed" = "none";
  let discVal = "0";

  if (startColId === "quantity") {
    qtyVal = unquote(rowCells[0] || "").replace(/[^0-9.]/g, "") || "1";
    priceVal = unquote(rowCells[1] || "").replace(/[^0-9.]/g, "") || "0.00";
    if (rowCells[2]) {
      const rawDisc = unquote(rowCells[2]);
      if (rawDisc.includes("%")) {
        discType = "percentage";
        discVal = rawDisc.replace(/[^0-9.]/g, "") || "0";
      } else if (rawDisc && rawDisc !== "0") {
        discType = "fixed";
        discVal = rawDisc.replace(/[^0-9.]/g, "") || "0";
      }
    }
  } else if (startColId === "unitPrice") {
    priceVal = unquote(rowCells[0] || "").replace(/[^0-9.]/g, "") || "0.00";
    if (rowCells[1]) {
      const rawDisc = unquote(rowCells[1]);
      if (rawDisc.includes("%")) {
        discType = "percentage";
        discVal = rawDisc.replace(/[^0-9.]/g, "") || "0";
      } else if (rawDisc && rawDisc !== "0") {
        discType = "fixed";
        discVal = rawDisc.replace(/[^0-9.]/g, "") || "0";
      }
    }
  } else {
    // item or description
    if (rowCells.length >= 5) {
      itemVal = unquote(rowCells[0] || "");
      descVal = unquote(rowCells[1] || "");
      qtyVal = unquote(rowCells[2] || "").replace(/[^0-9.]/g, "") || "1";
      priceVal = unquote(rowCells[3] || "").replace(/[^0-9.]/g, "") || "0.00";
      const rawDisc = unquote(rowCells[4] || "");
      if (rawDisc.includes("%")) {
        discType = "percentage";
        discVal = rawDisc.replace(/[^0-9.]/g, "") || "0";
      } else if (rawDisc && rawDisc !== "0") {
        discType = "fixed";
        discVal = rawDisc.replace(/[^0-9.]/g, "") || "0";
      }
    } else if (rowCells.length === 4) {
      itemVal = unquote(rowCells[0] || "");
      descVal = unquote(rowCells[1] || "");
      qtyVal = unquote(rowCells[2] || "").replace(/[^0-9.]/g, "") || "1";
      priceVal = unquote(rowCells[3] || "").replace(/[^0-9.]/g, "") || "0.00";
    } else if (rowCells.length === 3) {
      descVal = unquote(rowCells[0] || "");
      qtyVal = unquote(rowCells[1] || "").replace(/[^0-9.]/g, "") || "1";
      priceVal = unquote(rowCells[2] || "").replace(/[^0-9.]/g, "") || "0.00";
    } else if (rowCells.length === 2) {
      descVal = unquote(rowCells[0] || "");
      priceVal = unquote(rowCells[1] || "").replace(/[^0-9.]/g, "") || "0.00";
    } else {
      descVal = unquote(rowCells[0] || "");
    }
  }

  const matchedItem = items?.find(
    (i) =>
      (itemVal &&
        (i.sku?.toLowerCase() === itemVal.toLowerCase() ||
          i.name.toLowerCase() === itemVal.toLowerCase())) ||
      (descVal &&
        (i.sku?.toLowerCase() === descVal.toLowerCase() ||
          i.name.toLowerCase() === descVal.toLowerCase()))
  );

  const resolvedItemId = matchedItem ? matchedItem.id : (items?.find((i) => i.id === itemVal)?.id ?? "");
  const matchedDescBySkuOnly =
    !itemVal &&
    Boolean(descVal) &&
    Boolean(matchedItem?.sku) &&
    matchedItem!.sku!.toLowerCase() === descVal.toLowerCase();
  const resolvedDesc = matchedDescBySkuOnly
    ? matchedItem!.name
    : descVal || (matchedItem ? matchedItem.name : "");

  const isPurchaseAccount = accountFieldName === "expenseAccountId";
  const itemPriceMinor = isPurchaseAccount
    ? matchedItem?.purchasePriceMinor ?? matchedItem?.salesPriceMinor ?? null
    : matchedItem?.salesPriceMinor ?? matchedItem?.purchasePriceMinor ?? null;

  const resolvedPrice =
    priceVal !== "0.00" && priceVal !== ""
      ? priceVal
      : itemPriceMinor != null
      ? minorToCurrencyInput(itemPriceMinor, minorUnit)
      : minorToCurrencyInput(0, minorUnit);

  const resolvedItemAccountId = isPurchaseAccount
    ? matchedItem?.inventoryAssetAccountId || matchedItem?.salesAccountId || ""
    : matchedItem?.salesAccountId || matchedItem?.inventoryAssetAccountId || "";

  const lineData: Record<string, any> = {
    itemId: resolvedItemId,
    description: resolvedDesc,
    quantity: qtyVal || "1",
    unitPrice: resolvedPrice,
    discountType: discType,
    discountValue: discVal,
  };

  if (resolvedItemAccountId) {
    lineData[accountFieldName] = resolvedItemAccountId;
  }

  return {
    resolvedItemId,
    resolvedDesc,
    qtyVal: qtyVal || "1",
    resolvedPrice,
    discType,
    discVal,
    resolvedItemAccountId,
    lineData,
  };
}

export interface DocumentLineTableProps {
  // Form control
  register: UseFormRegister<any>;
  control?: any;
  setValue?: any;
  errors?: FieldErrors<any>;
  fields: { id: string }[];
  lines?: any[];
  onAppend: (initialValues?: any) => void;
  onRemove: (index: number) => void;
  onDuplicate?: (index: number) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onPasteTSV?: (tsvRows: string[][], startRow: number, startColId: string) => void;

  // Options
  items?: DocumentLineItemOption[];
  onItemSelect?: (index: number, itemId: string) => void;
  accounts: DocumentLineAccountOption[];
  accountFieldName: "salesAccountId" | "expenseAccountId";
  accountColumnLabel?: string;
  accountAriaLabel?: string;
  accountPlaceholder?: string;
  taxCodes?: DocumentLineTaxOption[];
  projects?: DocumentLineProjectOption[];

  // Currency & Previews
  currencyCode: string;
  minorUnit: number;
  previews: DocumentLinePreview[];
  amountsIncludeTax?: boolean;
  lineCustomFields?: CustomFieldInputDefinition[];

  // Column toggles (controlled optional)
  showLineNumber?: boolean;
  onShowLineNumberChange?: (show: boolean) => void;
  showDescription?: boolean;
  onShowDescriptionChange?: (show: boolean) => void;
  showDiscounts?: boolean;
  onShowDiscountsChange?: (show: boolean) => void;
  showLineProjects?: boolean;
  onShowLineProjectsChange?: (show: boolean) => void;
  showLineTaxCodes?: boolean;
  onShowLineTaxCodesChange?: (show: boolean) => void;

  // Initial column toggles (uncontrolled)
  initialShowLineNumber?: boolean;
  initialShowDescription?: boolean;
  initialShowDiscounts?: boolean;
  initialShowProjects?: boolean;
  initialShowLineTaxCodes?: boolean;

  // Totals panel & toggles integration
  showTotalsSection?: boolean;
  subtotalMinor?: number;
  taxMinor?: number;
  totalMinor?: number;
  baseEquivalentMinor?: number | null;
  baseCurrencyCode?: string;
  baseMinorUnit?: number;
  registerAmountsIncludeTax?: UseFormRegisterReturn;
}

export function DocumentLineTable({
  register,
  control,
  setValue,
  errors,
  fields,
  lines,
  onAppend,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onPasteTSV,
  items,
  onItemSelect,
  accounts,
  accountFieldName,
  accountColumnLabel = "Account",
  accountAriaLabel,
  accountPlaceholder,
  taxCodes = [],
  showLineTaxCodes: controlledShowLineTaxCodes,
  onShowLineTaxCodesChange,
  initialShowLineTaxCodes,
  projects,
  currencyCode,
  minorUnit,
  previews,
  amountsIncludeTax = false,
  lineCustomFields = [],
  showLineNumber: controlledShowLineNumber,
  onShowLineNumberChange,
  showDescription: controlledShowDescription,
  onShowDescriptionChange,
  showDiscounts: controlledShowDiscounts,
  onShowDiscountsChange,
  showLineProjects: controlledShowLineProjects,
  onShowLineProjectsChange,
  initialShowLineNumber = true,
  initialShowDescription = true,
  initialShowDiscounts,
  initialShowProjects,
  showTotalsSection = true,
  subtotalMinor = 0,
  taxMinor = 0,
  totalMinor,
  baseEquivalentMinor,
  baseCurrencyCode,
  baseMinorUnit,
  registerAmountsIncludeTax,
}: DocumentLineTableProps) {
  // Uncontrolled state fallbacks
  const [internalShowLineNumber, setInternalShowLineNumber] = useState(initialShowLineNumber);
  const [internalShowDescription, setInternalShowDescription] = useState(initialShowDescription);
  const [internalShowDiscounts, setInternalShowDiscounts] = useState(
    () => initialShowDiscounts ?? (lines?.some((l) => l?.discountType && l?.discountType !== "none") ?? false)
  );
  const [internalShowProjects, setInternalShowProjects] = useState(
    () => initialShowProjects ?? (lines?.some((l) => Boolean(l?.projectId)) ?? false)
  );
  const [internalShowLineTaxCodes, setInternalShowLineTaxCodes] = useState(
    () => initialShowLineTaxCodes ?? controlledShowLineTaxCodes ?? true
  );

  const showLineNumber = controlledShowLineNumber ?? internalShowLineNumber;
  const setShowLineNumber = onShowLineNumberChange ?? setInternalShowLineNumber;

  const showDescription = controlledShowDescription ?? internalShowDescription;
  const setShowDescription = onShowDescriptionChange ?? setInternalShowDescription;

  const showDiscounts = controlledShowDiscounts ?? internalShowDiscounts;
  const setShowDiscounts = onShowDiscountsChange ?? setInternalShowDiscounts;

  const showLineProjects = controlledShowLineProjects ?? internalShowProjects;
  const setShowLineProjects = onShowLineProjectsChange ?? setInternalShowProjects;

  const showLineTaxCodes =
    onShowLineTaxCodesChange !== undefined
      ? controlledShowLineTaxCodes ?? internalShowLineTaxCodes
      : internalShowLineTaxCodes;
  const setShowLineTaxCodes = onShowLineTaxCodesChange ?? setInternalShowLineTaxCodes;

  const resolvedAccountAria =
    accountAriaLabel ?? (accountFieldName === "salesAccountId" ? "sales account" : "expense account");

  // Default multi-row TSV clipboard paste handler (Excel / Google Sheets import)
  const defaultPasteTSV = useCallback(
    (tsvRows: string[][], startRow: number, startColId: string) => {
      if (!tsvRows.length || !setValue) return;

      tsvRows.forEach((rowCells, rIdx) => {
        const rowIndex = startRow + rIdx;
        const {
          resolvedItemId,
          resolvedDesc,
          qtyVal,
          resolvedPrice,
          discType,
          discVal,
          resolvedItemAccountId,
          lineData,
        } = resolvePastedTSVRow({
          rowCells,
          startColId,
          items,
          minorUnit,
          accountFieldName,
        });

        if (rowIndex < fields.length) {
          if (resolvedItemId) setValue(`lines.${rowIndex}.itemId`, resolvedItemId, { shouldDirty: true });
          if (resolvedDesc) setValue(`lines.${rowIndex}.description`, resolvedDesc, { shouldDirty: true });
          if (qtyVal) setValue(`lines.${rowIndex}.quantity`, qtyVal, { shouldDirty: true });
          if (resolvedPrice) setValue(`lines.${rowIndex}.unitPrice`, resolvedPrice, { shouldDirty: true });
          if (discType !== "none") {
            setValue(`lines.${rowIndex}.discountType`, discType, { shouldDirty: true });
            setValue(`lines.${rowIndex}.discountValue`, discVal, { shouldDirty: true });
          }
          if (resolvedItemAccountId) {
            setValue(`lines.${rowIndex}.${accountFieldName}`, resolvedItemAccountId, { shouldDirty: true });
          }
        } else {
          onAppend(lineData);
          setTimeout(() => {
            if (resolvedItemId) setValue(`lines.${rowIndex}.itemId`, resolvedItemId, { shouldDirty: true });
            if (resolvedDesc) setValue(`lines.${rowIndex}.description`, resolvedDesc, { shouldDirty: true });
            if (qtyVal) setValue(`lines.${rowIndex}.quantity`, qtyVal, { shouldDirty: true });
            if (resolvedPrice) setValue(`lines.${rowIndex}.unitPrice`, resolvedPrice, { shouldDirty: true });
            if (resolvedItemAccountId) {
              setValue(`lines.${rowIndex}.${accountFieldName}`, resolvedItemAccountId, { shouldDirty: true });
            }
          }, 0);
        }
      });
    },
    [items, fields.length, onAppend, setValue, minorUnit, accountFieldName]
  );

  // Adaptive, fluid column definitions (Manager.io / industry standard ERP layout)
  // - Columns adapt gracefully to container width without horizontal scrolling or overlaps
  // - Consolidated single Total column with secondary VAT indicator
  // - Compact, ergonomic inputs with zero layout shift
  const columns = useMemo((): DocumentGridColumnDef<any>[] => {
    const cols: DocumentGridColumnDef<any>[] = [];

    // 1. Line Number (#)
    cols.push({
      id: "lineNumber",
      header: "#",
      width: "32px",
      minWidth: "28px",
      align: "center",
      isVisible: showLineNumber,
      isEditable: false,
      renderCell: ({ index }) => (
        <span className="text-muted-foreground text-xs font-medium py-1.5 block text-center select-none">
          {index + 1}
        </span>
      ),
    });

    // 2. Item Selector (optional)
    if (items) {
      cols.push({
        id: "item",
        header: () => (
          <>
            Item <span className="font-normal text-muted-foreground">(opt)</span>
          </>
        ),
        width: showDescription ? "14%" : "28%",
        minWidth: "110px",
        isEditable: true,
        renderCell: ({ index, line, handleKeyDown }) => (
          <div className="min-w-0">
            <SearchableItemSelect
              items={items}
              value={line?.itemId ?? ""}
              dataGridRow={index}
              dataGridColId="item"
              onKeyDown={(e) => handleKeyDown(e, "item")}
              onChange={(itemId) => {
                register(`lines.${index}.itemId`).onChange({
                  target: { value: itemId, name: `lines.${index}.itemId` },
                });
                onItemSelect?.(index, itemId);
              }}
              ariaLabel={`Line ${index + 1} inventory item`}
            />
            <input type="hidden" {...register(`lines.${index}.itemId`)} />
          </div>
        ),
      });
    }

    // 3. Description (Flexible column that expands to fill available container space)
    cols.push({
      id: "description",
      header: "Description",
      width: "auto",
      minWidth: "140px",
      isVisible: showDescription,
      isEditable: true,
      renderCell: ({ index, errors: rowErrors, handleKeyDown }) => {
        const lineError = (rowErrors?.lines as any)?.[index];
        return (
          <div className="min-w-0">
            <Input
              aria-label={`Line ${index + 1} description`}
              data-grid-row={index}
              data-grid-col-id="description"
              className={cn(
                "w-full min-w-0 text-xs h-9 px-2.5",
                lineError?.description && "border-destructive focus-visible:ring-destructive"
              )}
              placeholder="Description..."
              {...register(`lines.${index}.description`)}
              onKeyDown={(e) => handleKeyDown(e, "description")}
            />
            {lineError?.description && (
              <p className="field-error">{lineError.description.message}</p>
            )}
          </div>
        );
      },
    });

    // 4. Quantity (Qty)
    cols.push({
      id: "quantity",
      header: "Qty",
      width: "58px",
      minWidth: "52px",
      align: "right",
      isEditable: true,
      renderCell: ({ index, errors: rowErrors, handleKeyDown }) => {
        const lineError = (rowErrors?.lines as any)?.[index];
        return (
          <div className="min-w-0">
            <Input
              data-grid-row={index}
              data-grid-col-id="quantity"
              className={cn(
                "money text-right w-full min-w-0 text-xs h-9 px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                lineError?.quantity && "border-destructive focus-visible:ring-destructive"
              )}
              type="number"
              step="0.0001"
              min="0.0001"
              aria-label={`Line ${index + 1} quantity`}
              {...register(`lines.${index}.quantity`)}
              onKeyDown={(e) => handleKeyDown(e, "quantity")}
            />
            {lineError?.quantity && (
              <p className="field-error">{lineError.quantity.message}</p>
            )}
          </div>
        );
      },
    });

    // 5. Rate / Unit Price
    cols.push({
      id: "unitPrice",
      header: "Rate",
      width: "76px",
      minWidth: "70px",
      align: "right",
      isEditable: true,
      renderCell: ({ index, errors: rowErrors, handleKeyDown }) => {
        const lineError = (rowErrors?.lines as any)?.[index];
        return (
          <div className="min-w-0">
            <Input
              data-grid-row={index}
              data-grid-col-id="unitPrice"
              className={cn(
                "money text-right w-full min-w-0 text-xs h-9 px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                lineError?.unitPrice && "border-destructive focus-visible:ring-destructive"
              )}
              type="number"
              step="0.01"
              min="0"
              aria-label={`Line ${index + 1} rate`}
              {...register(`lines.${index}.unitPrice`)}
              onKeyDown={(e) => handleKeyDown(e, "unitPrice")}
            />
            {lineError?.unitPrice && (
              <p className="field-error">{lineError.unitPrice.message}</p>
            )}
          </div>
        );
      },
    });

    // 6. Discount
    cols.push({
      id: "discount",
      header: "Discount",
      width: "78px",
      minWidth: "74px",
      align: "right",
      isVisible: showDiscounts,
      isEditable: true,
      renderCell: ({ index, line, handleKeyDown }) => (
        <div className="flex items-center h-9 w-full min-w-0 rounded-[6px] border border-border-strong bg-surface-raised overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-ring">
          <select
            data-grid-row={index}
            data-grid-col-id="discount"
            aria-label={`Line ${index + 1} discount type`}
            className="h-full w-8 shrink-0 bg-surface-muted/60 text-[11px] font-medium text-foreground px-0.5 text-center border-r border-border-strong/60 outline-none cursor-pointer hover:bg-surface-muted"
            {...register(`lines.${index}.discountType`)}
            onKeyDown={(e) => handleKeyDown(e, "discount")}
          >
            <option value="none">—</option>
            <option value="percentage">%</option>
            <option value="fixed">Fix</option>
          </select>
          {line?.discountType && line.discountType !== "none" ? (
            <input
              data-grid-row={index}
              data-grid-col-id="discountValue"
              aria-label={`Line ${index + 1} discount value`}
              className="money h-full w-full min-w-0 bg-transparent text-right px-1.5 text-xs text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              step="any"
              min="0"
              placeholder="0"
              {...register(`lines.${index}.discountValue`)}
              onKeyDown={(e) => handleKeyDown(e, "discountValue")}
            />
          ) : (
            <span className="h-full w-full flex items-center justify-center text-xs text-muted-foreground/40 select-none bg-surface-muted/20">
              0
            </span>
          )}
        </div>
      ),
    });

    // 7. Account
    cols.push({
      id: "account",
      header: accountColumnLabel,
      width: showDescription ? "14%" : (showLineProjects ? "22%" : "28%"),
      minWidth: "110px",
      isEditable: true,
      renderCell: ({ index, line, errors: rowErrors, handleKeyDown }) => {
        const lineError = (rowErrors?.lines as any)?.[index];
        return (
          <div className="min-w-0">
            {line?.itemId ? (
              <div className="h-9 flex items-center px-2 rounded-[6px] bg-surface-muted/40 border border-transparent">
                <input type="hidden" {...register(`lines.${index}.${accountFieldName}`)} />
                <span className="text-xs text-muted-foreground italic truncate">Auto (item)</span>
              </div>
            ) : (
              <SelectNative
                data-grid-row={index}
                data-grid-col-id="account"
                aria-label={`Line ${index + 1} ${resolvedAccountAria}`}
                className={cn(
                  "w-full text-xs h-9 px-1.5 truncate",
                  lineError?.[accountFieldName] && "border-destructive focus-visible:ring-destructive"
                )}
                {...register(`lines.${index}.${accountFieldName}`)}
                onKeyDown={(e) => handleKeyDown(e, "account")}
              >
                {accountPlaceholder && <option value="">{accountPlaceholder}</option>}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </SelectNative>
            )}
            {lineError?.[accountFieldName] && (
              <p className="field-error">{lineError[accountFieldName].message}</p>
            )}
            {!showLineTaxCodes && (
              <input type="hidden" {...register(`lines.${index}.taxCodeId`)} />
            )}
          </div>
        );
      },
    });

    // 8. VAT / Tax Code
    cols.push({
      id: "taxCode",
      header: "VAT",
      width: "80px",
      minWidth: "76px",
      isVisible: showLineTaxCodes,
      isEditable: true,
      renderCell: ({ index, errors: rowErrors, handleKeyDown }) => {
        const lineError = (rowErrors?.lines as any)?.[index];
        return (
          <div className="min-w-0">
            <SelectNative
              data-grid-row={index}
              data-grid-col-id="taxCode"
              aria-label={`Line ${index + 1} tax code`}
              className={cn(
                "w-full text-xs h-9 px-1.5 truncate",
                lineError?.taxCodeId && "border-destructive focus-visible:ring-destructive"
              )}
              {...register(`lines.${index}.taxCodeId`)}
              onKeyDown={(e) => handleKeyDown(e, "taxCode")}
            >
              {taxCodes.map((taxCode) => (
                <option key={taxCode.id} value={taxCode.id}>
                  {taxCode.name}
                </option>
              ))}
            </SelectNative>
            {lineError?.taxCodeId && (
              <p className="field-error">{lineError.taxCodeId.message}</p>
            )}
          </div>
        );
      },
    });

    // 9. Project Override
    cols.push({
      id: "project",
      header: "Project",
      width: "86px",
      minWidth: "80px",
      isVisible: showLineProjects,
      isEditable: true,
      renderCell: ({ index, handleKeyDown }) => (
        <div className="min-w-0">
          <SelectNative
            data-grid-row={index}
            data-grid-col-id="project"
            aria-label={`Line ${index + 1} project`}
            className="w-full text-xs h-9 px-1.5 truncate"
            {...register(`lines.${index}.projectId`)}
            onKeyDown={(e) => handleKeyDown(e, "project")}
          >
            <option value="">Default</option>
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {"code" in project && project.code ? `${project.code} — ` : ""}
                {project.name}
              </option>
            ))}
          </SelectNative>
        </div>
      ),
    });

    // 9b. Line-level Custom Fields (dynamic columns in DocumentGrid)
    for (const cf of lineCustomFields) {
      const colId = `cf_${cf.id}`;
      cols.push({
        id: colId,
        header: cf.name,
        width: cf.fieldType === "checkbox" ? "58px" : "100px",
        minWidth: cf.fieldType === "checkbox" ? "52px" : "86px",
        align: cf.fieldType === "checkbox" ? "center" : cf.fieldType === "number" ? "right" : "left",
        isVisible: true,
        isEditable: true,
        renderCell: ({ index, line, handleKeyDown }) => {
          const fieldPath = `lines.${index}.customFields.${cf.id}`;
          if (cf.fieldType === "checkbox") {
            const checked = line?.customFields?.[cf.id] === "true" || line?.customFields?.[cf.id] === true;
            return (
              <div className="flex h-9 items-center justify-center">
                <input
                  type="checkbox"
                  data-grid-row={index}
                  data-grid-col-id={colId}
                  aria-label={`Line ${index + 1} ${cf.name}`}
                  checked={checked}
                  onChange={(e) => {
                    if (setValue) {
                      setValue(fieldPath, e.target.checked ? "true" : "false", { shouldDirty: true });
                    }
                  }}
                  onKeyDown={(e) => handleKeyDown(e, colId)}
                  className="size-4 accent-[var(--primary)]"
                />
              </div>
            );
          }
          if (cf.fieldType === "select") {
            return (
              <SelectNative
                data-grid-row={index}
                data-grid-col-id={colId}
                aria-label={`Line ${index + 1} ${cf.name}`}
                className="w-full text-xs h-9 px-1.5 truncate"
                {...register(fieldPath)}
                onKeyDown={(e) => handleKeyDown(e, colId)}
              >
                <option value="">—</option>
                {cf.selectOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </SelectNative>
            );
          }
          return (
            <Input
              data-grid-row={index}
              data-grid-col-id={colId}
              type={cf.fieldType === "date" ? "date" : "text"}
              inputMode={cf.fieldType === "number" ? "decimal" : undefined}
              placeholder={cf.isRequired ? "Required" : ""}
              aria-label={`Line ${index + 1} ${cf.name}`}
              className={cn(
                "w-full min-w-0 text-xs h-9 px-1.5",
                cf.fieldType === "number" && "money text-right",
              )}
              {...register(fieldPath)}
              onKeyDown={(e) => handleKeyDown(e, colId)}
            />
          );
        },
      });
    }

    // 10. Amount / Total (consolidated calculation column matching Manager.io)
    cols.push({
      id: "total",
      header: "Total",
      width: "84px",
      minWidth: "80px",
      align: "right",
      isEditable: false,
      renderCell: ({ preview }) => (
        <div className="text-right pt-2 min-w-0 overflow-hidden">
          <span
            className="money block text-xs font-semibold text-foreground truncate"
            title={formatMoney(preview?.grossMinor ?? 0, currencyCode, minorUnit)}
          >
            {formatMoney(preview?.grossMinor ?? 0, currencyCode, minorUnit)}
          </span>
          {!amountsIncludeTax && (preview?.taxMinor ?? 0) > 0 && (
            <span
              className="money block text-[10px] text-muted-foreground truncate"
              title={`+${formatMoney(preview?.taxMinor ?? 0, currencyCode, minorUnit)} VAT`}
            >
              +{formatMoney(preview?.taxMinor ?? 0, currencyCode, minorUnit)}
            </span>
          )}
        </div>
      ),
    });

    // 11. Actions
    cols.push({
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      width: "36px",
      minWidth: "36px",
      align: "center",
      isEditable: false,
      renderCell: ({ index, isFirstRow, isLastRow, duplicateLine, removeLine, moveLineUp, moveLineDown }) => {
        const hasExtraActions = Boolean(duplicateLine || moveLineUp || moveLineDown);
        if (!hasExtraActions) {
          return (
            <div className="flex items-center justify-center pt-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-danger hover:bg-danger/10"
                aria-label={`Remove line ${index + 1}`}
                disabled={fields.length === 1}
                title={fields.length === 1 ? "At least one line is required" : "Delete line"}
                onClick={() => removeLine(index)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        }

        return (
          <div className="flex items-center justify-center pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground hover:bg-surface-muted"
                  aria-label={`Line ${index + 1} actions`}
                  title="Line actions"
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {duplicateLine && (
                  <DropdownMenuItem onClick={() => duplicateLine(index)}>
                    <Copy className="size-3.5 mr-2" /> Duplicate line
                  </DropdownMenuItem>
                )}
                {moveLineUp && (
                  <DropdownMenuItem disabled={isFirstRow} onClick={() => moveLineUp(index)}>
                    <ArrowUp className="size-3.5 mr-2" /> Move up
                  </DropdownMenuItem>
                )}
                {moveLineDown && (
                  <DropdownMenuItem disabled={isLastRow} onClick={() => moveLineDown(index)}>
                    <ArrowDown className="size-3.5 mr-2" /> Move down
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={fields.length === 1}
                  className="text-danger focus:text-danger"
                  onClick={() => removeLine(index)}
                >
                  <Trash2 className="size-3.5 mr-2" /> Delete line
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });

    return cols;
  }, [
    showLineNumber,
    items,
    showDescription,
    showDiscounts,
    accountColumnLabel,
    accountFieldName,
    resolvedAccountAria,
    accountPlaceholder,
    accounts,
    showLineTaxCodes,
    taxCodes,
    showLineProjects,
    projects,
    amountsIncludeTax,
    currencyCode,
    minorUnit,
    register,
    setValue,
    onItemSelect,
    fields,
    lineCustomFields,
  ]);

  return (
    <div>
      {typeof errors?.lines?.message === "string" && (
        <p className="field-error mb-2">{errors.lines.message}</p>
      )}

      <DocumentGrid
        columns={columns}
        fields={fields}
        lines={lines}
        previews={previews}
        register={register}
        control={control}
        errors={errors}
        taxCodes={taxCodes}
        minorUnit={minorUnit}
        currencyCode={currencyCode}
        amountsIncludeTax={amountsIncludeTax}
        onAppend={() => onAppend()}
        onRemove={onRemove}
        onDuplicate={onDuplicate}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onPasteTSV={onPasteTSV ?? defaultPasteTSV}
      />

      {showTotalsSection && (
        <div className="mt-5 flex flex-col md:flex-row items-start justify-between gap-6">
          <DocumentColumnToggles
            showLineNumber={showLineNumber}
            onShowLineNumberChange={setShowLineNumber}
            showDescription={showDescription}
            onShowDescriptionChange={setShowDescription}
            showDiscounts={showDiscounts}
            onShowDiscountsChange={setShowDiscounts}
            showLineProjects={showLineProjects}
            onShowLineProjectsChange={setShowLineProjects}
            showLineTaxCodes={showLineTaxCodes}
            onShowLineTaxCodesChange={setShowLineTaxCodes}
            registerAmountsIncludeTax={registerAmountsIncludeTax}
          />
          <DocumentTotalsPanel
            subtotalMinor={subtotalMinor}
            taxMinor={taxMinor}
            totalMinor={totalMinor}
            currencyCode={currencyCode}
            minorUnit={minorUnit}
            baseEquivalentMinor={baseEquivalentMinor}
            baseCurrencyCode={baseCurrencyCode}
            baseMinorUnit={baseMinorUnit}
          />
        </div>
      )}
    </div>
  );
}
