"use client";

import { useMemo } from "react";
import type { Control, FieldValues } from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
  calculateDiscount,
  calculateTax,
  multiplyMoneyByQuantity,
  parseQuantityToMicros,
  splitTaxInclusive,
} from "@/modules/accounting/calculations/money";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";

export interface DocumentLineTaxOption {
  id: string;
  name: string;
  rateBasisPoints: number;
}

export interface DocumentLinePreview {
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
}

export function previewDocumentLine(
  line:
    | {
        unitPrice?: string | number | null;
        quantity?: string | number | null;
        discountType?: string | null;
        discountValue?: string | number | null;
        taxCodeId?: string | null;
      }
    | undefined,
  taxCodes: DocumentLineTaxOption[],
  minorUnit: number,
  amountsIncludeTax = false
): DocumentLinePreview {
  try {
    const unitPriceMinor = parseCurrencyAmountToMinor(
      String(line?.unitPrice || "0"),
      minorUnit,
      "Unit price"
    );
    const quantityMicros = parseQuantityToMicros(String(line?.quantity || "0"));
    const lineTotalMinor = multiplyMoneyByQuantity(unitPriceMinor, quantityMicros);
    const discountMinor = calculateDiscount(
      lineTotalMinor,
      (line?.discountType as any) || "none",
      String(line?.discountValue || "0"),
      minorUnit
    );
    const discountedTotalMinor = lineTotalMinor - discountMinor;
    const rate =
      taxCodes.find((tax) => tax.id === line?.taxCodeId)?.rateBasisPoints ?? 0;

    let netMinor = 0;
    let taxMinor = 0;
    let grossMinor = 0;

    if (amountsIncludeTax) {
      grossMinor = discountedTotalMinor;
      const split = splitTaxInclusive(grossMinor, rate);
      netMinor = split.netMinor;
      taxMinor = split.taxMinor;
    } else {
      netMinor = discountedTotalMinor;
      taxMinor = calculateTax(netMinor, rate);
      grossMinor = netMinor + taxMinor;
    }
    return { netMinor, taxMinor, grossMinor };
  } catch {
    return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
  }
}

export function useDocumentTotals<TFieldValues extends FieldValues = any>({
  control,
  taxCodes,
  minorUnit,
}: {
  control: Control<TFieldValues>;
  taxCodes: DocumentLineTaxOption[];
  minorUnit: number;
}) {
  const lines = (useWatch({ control, name: "lines" as any }) ?? []) as any[];
  const amountsIncludeTax =
    (useWatch({ control, name: "amountsIncludeTax" as any }) as boolean) ?? false;

  const previews = useMemo(() => {
    return lines.map((line) =>
      previewDocumentLine(line, taxCodes, minorUnit, amountsIncludeTax)
    );
  }, [lines, taxCodes, minorUnit, amountsIncludeTax]);

  const subtotalMinor = useMemo(
    () => previews.reduce((sum, row) => sum + row.netMinor, 0),
    [previews]
  );
  const taxMinor = useMemo(
    () => previews.reduce((sum, row) => sum + row.taxMinor, 0),
    [previews]
  );
  const totalMinor = subtotalMinor + taxMinor;

  return {
    lines,
    amountsIncludeTax,
    previews,
    subtotalMinor,
    taxMinor,
    totalMinor,
  };
}
