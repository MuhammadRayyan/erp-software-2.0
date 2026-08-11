import type { CreditNoteReasonCode, EInvoiceDocumentType, EInvoiceSourceType, EInvoiceTransactionFlags } from "./einvoice-types";

export type CanonicalParty = {
  legalName: string;
  trn: string;
  legalRegistrationIdentifier: string;
  endpointIdentifier: string;
  endpointScheme: string;
  addressLine1: string;
  city: string;
  countrySubdivision: string;
  countryCode: string;
};

export type CanonicalTaxCategory = "S" | "Z";

export type CanonicalEInvoiceLine = {
  id: string;
  description: string;
  itemName: string;
  quantityMicros: number;
  unitCode: string;
  unitPriceMinor: number;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  taxCategory: CanonicalTaxCategory;
  taxRateBasisPoints: number;
};

export type CanonicalTaxBreakdown = {
  taxCategory: CanonicalTaxCategory;
  taxRateBasisPoints: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
};

export type CanonicalEInvoice = {
  specificationVersion: string;
  customizationId: string;
  profileId: string;
  profileExecutionId: string;
  uuid: string;
  sourceType: EInvoiceSourceType;
  sourceId: string;
  documentType: EInvoiceDocumentType;
  documentNumber: string;
  issueDate: string;
  dueDate: string | null;
  currencyCode: "AED";
  supplier: CanonicalParty;
  buyer: CanonicalParty;
  buyerReference: string | null;
  billingReference: { documentNumber: string; issueDate: string } | null;
  creditNoteReasonCode: CreditNoteReasonCode | null;
  note: string | null;
  transactionFlags: EInvoiceTransactionFlags;
  lines: CanonicalEInvoiceLine[];
  taxBreakdowns: CanonicalTaxBreakdown[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};
