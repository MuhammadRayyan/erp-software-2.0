import type { ActionKey, ModuleKey } from "@/core/permissions/module-access";

export const APPROVAL_ENTITY_CONFIG = {
  sales_invoice: {
    label: "Sales Invoice",
    module: "sales" as ModuleKey,
    defaultAction: "post" as ActionKey,
    detailUrl: (businessId: string, id: string) => `/b/${businessId}/sales/invoices/${id}`,
  },
  purchase_invoice: {
    label: "Purchase Invoice",
    module: "purchases" as ModuleKey,
    defaultAction: "post" as ActionKey,
    detailUrl: (businessId: string, id: string) => `/b/${businessId}/purchases/invoices/${id}`,
  },
  purchase_order: {
    label: "Purchase Order",
    module: "purchases" as ModuleKey,
    defaultAction: "approve" as ActionKey,
    detailUrl: (businessId: string, id: string) => `/b/${businessId}/purchases/orders/${id}`,
  },
  supplier_payment: {
    label: "Supplier Payment",
    module: "purchases" as ModuleKey,
    defaultAction: "post" as ActionKey,
    detailUrl: (businessId: string, id: string) => `/b/${businessId}/purchases/payments/${id}`,
  },
  receipt: {
    label: "Receipt",
    module: "sales" as ModuleKey,
    defaultAction: "post" as ActionKey,
    detailUrl: (businessId: string, id: string) => `/b/${businessId}/sales/receipts/${id}`,
  },
} as const;

export type ApprovalEntityType = keyof typeof APPROVAL_ENTITY_CONFIG;

export interface ApprovalRuleRecord {
  id: string;
  entityType: string;
  module: string;
  isEnabled: boolean;
  thresholdMinor: number;
  requireCheckerSeparation: boolean;
  updatedAt: string;
}

export interface ApprovalEvaluation {
  requiresApproval: boolean;
  reason: "user_policy" | "spend_threshold" | "none";
  ruleEnabled: boolean;
  thresholdMinor: number;
  requireCheckerSeparation: boolean;
}
