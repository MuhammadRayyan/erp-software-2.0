export const vatCategories = [
  "standard",
  "zero_rated",
  "exempt",
  "out_of_scope",
  "reverse_charge",
  "import",
] as const;

export type VatCategory = (typeof vatCategories)[number];

export const taxDirections = ["sales", "purchases", "both"] as const;
export type TaxDirection = (typeof taxDirections)[number];

export const emirates = [
  "abu_dhabi",
  "dubai",
  "sharjah",
  "ajman",
  "umm_al_quwain",
  "ras_al_khaimah",
  "fujairah",
] as const;

export type Emirate = (typeof emirates)[number];

export const emirateLabels: Record<Emirate, string> = {
  abu_dhabi: "Abu Dhabi",
  dubai: "Dubai",
  sharjah: "Sharjah",
  ajman: "Ajman",
  umm_al_quwain: "Umm Al Quwain",
  ras_al_khaimah: "Ras Al Khaimah",
  fujairah: "Fujairah",
};

export const vatCategoryLabels: Record<VatCategory, string> = {
  standard: "Standard",
  zero_rated: "Zero Rated",
  exempt: "Exempt",
  out_of_scope: "Out of Scope",
  reverse_charge: "Reverse Charge",
  import: "Import",
};

export const taxDirectionLabels: Record<TaxDirection, string> = {
  sales: "Sales",
  purchases: "Purchases",
  both: "Both",
};

export const vatReportBuckets = [
  { id: "standard_sales", label: "Standard-rated supplies", section: "sales" },
  { id: "zero_rated_sales", label: "Zero-rated supplies", section: "sales" },
  { id: "exempt_sales", label: "Exempt supplies", section: "sales" },
  { id: "reverse_charge_output", label: "Reverse-charge output VAT", section: "sales" },
  { id: "standard_purchases", label: "Standard-rated purchases / expenses", section: "purchases" },
  { id: "import_purchases", label: "Import purchases", section: "purchases" },
  { id: "reverse_charge_purchases", label: "Reverse-charge purchases", section: "purchases" },
] as const;

export type VatReportBucket = (typeof vatReportBuckets)[number]["id"];

export const vatAdjustmentBuckets = ["output_vat_adjustment", "input_vat_adjustment"] as const;
export type VatAdjustmentBucket = (typeof vatAdjustmentBuckets)[number];

export function categoryIsVatAffecting(category: VatCategory | null) {
  return category !== "out_of_scope";
}

export function directionAllows(configured: TaxDirection, used: Exclude<TaxDirection, "both">) {
  return configured === "both" || configured === used;
}

export function addDaysIso(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
