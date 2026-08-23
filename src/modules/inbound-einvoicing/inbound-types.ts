import type { ValidationIssue } from "../einvoicing/einvoice-types";
export const inboundEInvoiceStatuses = [
  "Received",
  "ValidationFailed",
  "Validated",
  "NeedsSupplier",
  "NeedsReview",
  "ReadyForDraft",
  "DraftCreated",
  "Processed",
  "Rejected",
  "Archived",
] as const;

export type InboundEInvoiceStatus = (typeof inboundEInvoiceStatuses)[number];
export type InboundDocumentType = "invoice" | "credit_note";
export type InboundLineMatchStatus = "Matched" | "Possible Match" | "Unmatched";

export type InboundParty = {
  legalName: string;
  trn: string | null;
  legalRegistrationIdentifier: string | null;
  endpointIdentifier: string | null;
  endpointScheme: string | null;
  addressLine1: string | null;
  city: string | null;
  countrySubdivision: string | null;
  countryCode: string | null;
};

export type CanonicalInboundLine = {
  sourceLineId: string;
  orderLineReference: string | null;
  supplierItemIdentifier: string | null;
  erpItemIdentifier: string | null;
  description: string;
  itemName: string | null;
  quantityMicros: number;
  unitCode: string;
  unitPriceMinor: number;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  taxCategory: string;
  taxRateBasisPoints: number;
};

export type CanonicalInboundEInvoice = {
  specificationVersion: string;
  customizationId: string;
  profileId: string;
  documentType: InboundDocumentType;
  documentUuid: string;
  documentNumber: string;
  issueDate: string;
  taxDate: string | null;
  dueDate: string | null;
  currencyCode: string;
  orderReference: string | null;
  despatchReference: string | null;
  sourceInvoiceReference: string | null;
  supplier: InboundParty;
  buyer: InboundParty;
  lines: CanonicalInboundLine[];
  subtotalMinor: number;
  allowanceTotalMinor: number;
  chargeTotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountDueMinor: number;
};



export type InboundValidationReport = {
  valid: boolean;
  specificationVersion: string;
  validatedAt: string;
  layers: {
    security: { valid: boolean; issueCount: number };
    parsing: { valid: boolean; issueCount: number };
    pintUbl: { valid: boolean; issueCount: number };
    pintAe: { valid: boolean; issueCount: number };
    business: { valid: boolean; issueCount: number };
    mapping: { valid: boolean; issueCount: number };
  };
  issues: ValidationIssue[];
};

export type InboundLineMappingInput = {
  lineId: string;
  purchaseOrderLineId?: string | null;
  itemId?: string | null;
  expenseAccountId?: string | null;
  taxCodeId?: string | null;
  projectId?: string | null;
  saveSupplierItemMapping?: boolean;
};

export type { ValidationIssue };
