import { getBusinessAccess } from "./permissions";
import type { ModuleKey } from "./module-access";

const documentModules = {
  "sales-invoice": "sales",
  "sales-credit-note": "sales",
  "delivery-note": "inventory",
  "purchase-order": "purchases",
  "purchase-invoice": "purchases",
  "goods-receipt": "inventory",
} as const satisfies Record<string, ModuleKey>;

export type PdfDocumentType = keyof typeof documentModules;

export function getDocumentPdfModule(documentType: string): ModuleKey | null {
  return documentModules[documentType as PdfDocumentType] ?? null;
}

export function getDocumentPdfAccess(
  businessId: string,
  userId: string,
  documentType: string,
) {
  const requiredModule = getDocumentPdfModule(documentType);
  if (!requiredModule) return null;
  const access = getBusinessAccess(businessId, userId);
  if (!access?.modules.includes(requiredModule)) return null;
  return access;
}
