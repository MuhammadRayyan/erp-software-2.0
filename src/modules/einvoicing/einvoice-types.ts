export const PINT_AE_SPECIFICATION_VERSION = "1.0.4" as const;
export const PINT_AE_CUSTOMIZATION_ID = "urn:peppol:pint:billing-1@ae-1" as const;
export const PINT_AE_PROFILE_ID = "urn:peppol:bis:billing" as const;

export const eInvoiceStatuses = [
  "NotPrepared",
  "NeedsData",
  "ValidationFailed",
  "Ready",
  "Submitted",
  "Accepted",
  "Rejected",
] as const;

export type EInvoiceStatus = (typeof eInvoiceStatuses)[number];
export type EInvoiceSourceType = "sales_invoice" | "sales_credit_note";
export type EInvoiceDocumentType = "invoice" | "credit_note";

export const creditNoteReasonCodeValues = [
  "DL8.61.1.A",
  "DL8.61.1.B",
  "DL8.61.1.C",
  "DL8.61.1.D",
  "DL8.61.1.E",
] as const;

export const creditNoteReasonCodes = [
  { value: "DL8.61.1.A", label: "Cancellation" },
  { value: "DL8.61.1.B", label: "Tax treatment changed" },
  { value: "DL8.61.1.C", label: "Consideration altered or bad debt" },
  { value: "DL8.61.1.D", label: "Goods or services returned" },
  { value: "DL8.61.1.E", label: "Tax error" },
] as const;

export type CreditNoteReasonCode = (typeof creditNoteReasonCodeValues)[number];

export function normalizeCreditNoteReasonCode(value: string | null | undefined): CreditNoteReasonCode | "" {
  return creditNoteReasonCodeValues.includes(value as CreditNoteReasonCode) ? value as CreditNoteReasonCode : "";
}

export type EInvoiceTransactionFlags = {
  freeTradeZone: boolean;
  deemedSupply: boolean;
  marginScheme: boolean;
  summaryInvoice: boolean;
  continuousSupply: boolean;
  agentBilling: boolean;
  eCommerce: boolean;
  export: boolean;
};

export const emptyTransactionFlags: EInvoiceTransactionFlags = {
  freeTradeZone: false,
  deemedSupply: false,
  marginScheme: false,
  summaryInvoice: false,
  continuousSupply: false,
  agentBilling: false,
  eCommerce: false,
  export: false,
};

export function parseTransactionFlags(value: string | null | undefined): EInvoiceTransactionFlags {
  if (!value) return { ...emptyTransactionFlags };
  try {
    const parsed = JSON.parse(value) as Partial<EInvoiceTransactionFlags>;
    return Object.fromEntries(
      Object.keys(emptyTransactionFlags).map((key) => [key, parsed[key as keyof EInvoiceTransactionFlags] === true]),
    ) as EInvoiceTransactionFlags;
  } catch {
    return { ...emptyTransactionFlags };
  }
}

export function profileExecutionId(flags: EInvoiceTransactionFlags) {
  return [
    flags.freeTradeZone,
    flags.deemedSupply,
    flags.marginScheme,
    flags.summaryInvoice,
    flags.continuousSupply,
    flags.agentBilling,
    flags.eCommerce,
    flags.export,
  ].map((value) => value ? "1" : "0").join("");
}

export type EInvoiceValidationIssue = {
  layer: "readiness" | "mapping" | "pint-ubl" | "pint-ae";
  ruleId: string;
  message: string;
  path?: string;
};

export type EInvoiceValidationReport = {
  valid: boolean;
  specificationVersion: string;
  validatedAt: string;
  layers: {
    readiness: { valid: boolean; issueCount: number };
    mapping: { valid: boolean; issueCount: number };
    pintUbl: { valid: boolean; issueCount: number };
    pintAe: { valid: boolean; issueCount: number };
  };
  issues: EInvoiceValidationIssue[];
};
