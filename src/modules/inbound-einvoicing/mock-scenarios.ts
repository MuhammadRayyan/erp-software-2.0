export const mockInboundScenarios = [
  "valid_invoice",
  "invalid_invoice",
  "duplicate_invoice",
  "unknown_supplier",
  "po_matched_invoice",
  "goods_receipt_matched_invoice",
  "vat_mismatch",
  "unsupported_credit_note",
] as const;

export type MockInboundScenario = (typeof mockInboundScenarios)[number];
