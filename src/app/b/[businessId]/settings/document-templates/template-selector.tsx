"use client";

import { useRouter } from "next/navigation";
import { SelectNative } from "@/components/ui/select-native";
import { FileText, ShoppingCart, Truck, Receipt } from "lucide-react";

export const SUPPORTED_DOCUMENT_TYPES = [
  { value: "sales-invoice", label: "Sales Invoice", category: "Sales" },
  { value: "sales-quote", label: "Sales Quote", category: "Sales" },
  { value: "sales-order", label: "Sales Order", category: "Sales" },
  { value: "sales-credit-note", label: "Sales Credit Note", category: "Sales" },
  { value: "purchase-quote", label: "Purchase Quote", category: "Purchases" },
  { value: "purchase-order", label: "Purchase Order", category: "Purchases" },
  { value: "purchase-invoice", label: "Purchase Invoice", category: "Purchases" },
  { value: "debit-note", label: "Debit Note", category: "Purchases" },
  { value: "delivery-note", label: "Delivery Note", category: "Inventory" },
  { value: "goods-receipt", label: "Goods Receipt", category: "Inventory" },
];

const POPULAR_TYPES = [
  { value: "sales-invoice", label: "Invoice", icon: Receipt },
  { value: "sales-quote", label: "Quote", icon: FileText },
  { value: "sales-order", label: "Order", icon: ShoppingCart },
  { value: "purchase-order", label: "PO", icon: ShoppingCart },
  { value: "delivery-note", label: "Delivery", icon: Truck },
];

export function TemplateSelector({ currentType, businessId }: { currentType: string; businessId: string }) {
  const router = useRouter();

  function selectType(type: string) {
    router.push(`/b/${businessId}/settings/document-templates?type=${type}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      {/* Quick Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground mr-1">Quick Select:</span>
        {POPULAR_TYPES.map((pt) => {
          const Icon = pt.icon;
          const isActive = currentType === pt.value;
          return (
            <button
              key={pt.value}
              type="button"
              onClick={() => selectType(pt.value)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-xs font-semibold"
                  : "border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {pt.label}
            </button>
          );
        })}
      </div>

      {/* Full Dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">All Documents:</span>
        <SelectNative
          value={currentType}
          onChange={(e) => selectType(e.target.value)}
          className="h-9 text-sm min-w-[200px]"
        >
          <optgroup label="Sales Documents">
            {SUPPORTED_DOCUMENT_TYPES.filter((t) => t.category === "Sales").map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </optgroup>
          <optgroup label="Purchase Documents">
            {SUPPORTED_DOCUMENT_TYPES.filter((t) => t.category === "Purchases").map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </optgroup>
          <optgroup label="Inventory Documents">
            {SUPPORTED_DOCUMENT_TYPES.filter((t) => t.category === "Inventory").map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </optgroup>
        </SelectNative>
      </div>
    </div>
  );
}
