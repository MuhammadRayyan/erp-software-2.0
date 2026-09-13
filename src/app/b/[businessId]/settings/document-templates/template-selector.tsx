"use client";

import { useRouter } from "next/navigation";
import { SelectNative } from "@/components/ui/select-native";

export const SUPPORTED_DOCUMENT_TYPES = [
  { value: "sales-invoice", label: "Sales Invoice" },
  { value: "sales-quote", label: "Sales Quote" },
  { value: "sales-order", label: "Sales Order" },
  { value: "sales-credit-note", label: "Credit Note" },
  { value: "purchase-quote", label: "Purchase Quote" },
  { value: "purchase-order", label: "Purchase Order" },
  { value: "purchase-invoice", label: "Purchase Invoice" },
  { value: "debit-note", label: "Debit Note" },
  { value: "goods-receipt", label: "Goods Receipt" },
  { value: "delivery-note", label: "Delivery Note" },
];

export function TemplateSelector({ currentType, businessId }: { currentType: string; businessId: string }) {
  const router = useRouter();

  return (
    <div className="mb-6 max-w-sm">
      <label className="mb-1.5 block text-sm font-medium text-foreground">Select Document Type</label>
      <SelectNative
        value={currentType}
        onChange={(e) => {
          router.push(`/b/${businessId}/settings/document-templates?type=${e.target.value}`);
        }}
      >
        {SUPPORTED_DOCUMENT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </SelectNative>
    </div>
  );
}
