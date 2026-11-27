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
import { isSelfAssessedVatCategory } from "@/modules/tax/uae-vat-config";

export interface DocumentLineTaxOption {
  id: string;
  name: string;
  rateBasisPoints: number;
  vatCategory?: string | null;
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
    const taxOption = taxCodes.find((tax) => tax.id === line?.taxCodeId);
    const rate = taxOption?.rateBasisPoints ?? 0;
    const vatCategory = taxOption?.vatCategory;

    let netMinor = 0;
    let taxMinor = 0;
    let grossMinor = 0;

    if (amountsIncludeTax) {
      grossMinor = discountedTotalMinor;
      if (isSelfAssessedVatCategory(vatCategory)) {
        // Supplier charges no VAT: the price is the net; VAT is self-assessed on it.
        netMinor = grossMinor;
        taxMinor = calculateTax(netMinor, rate);
      } else {
        const split = splitTaxInclusive(grossMinor, rate);
        netMinor = split.netMinor;
        taxMinor = split.taxMinor;
      }
    } else {
      netMinor = discountedTotalMinor;
      taxMinor = calculateTax(netMinor, rate);
      grossMinor = isSelfAssessedVatCategory(vatCategory) ? netMinor : netMinor + taxMinor;
    }
    return { netMinor, taxMinor, grossMinor };
  } catch {
    return { netMinor: 0, taxMinor: 0, grossMinor: 0 };
  }
}

export function computeDocumentTotals(
  lines: any[],
  taxCodes: DocumentLineTaxOption[],
  minorUnit: number,
  amountsIncludeTax: boolean,
) {
  const previews = (lines ?? []).map((line) =>
    previewDocumentLine(line, taxCodes, minorUnit, amountsIncludeTax)
  );
  const subtotalMinor = previews.reduce((sum, row) => sum + row.netMinor, 0);
  const taxMinor = previews.reduce((sum, row) => sum + row.taxMinor, 0);
  const totalMinor = previews.reduce((sum, row) => sum + row.grossMinor, 0);
  return { previews, subtotalMinor, taxMinor, totalMinor };
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
  const watchedLines = useWatch({ control, name: "lines" as any });
  const lines = useMemo(() => (watchedLines ?? []) as any[], [watchedLines]);
  const amountsIncludeTax =
    (useWatch({ control, name: "amountsIncludeTax" as any }) as boolean) ?? false;

  const { previews, subtotalMinor, taxMinor, totalMinor } = useMemo(
    () => computeDocumentTotals(lines, taxCodes, minorUnit, amountsIncludeTax),
    [lines, taxCodes, minorUnit, amountsIncludeTax]
  );

  return {
    lines,
    amountsIncludeTax,
    previews,
    subtotalMinor,
    taxMinor,
    totalMinor,
  };
}
