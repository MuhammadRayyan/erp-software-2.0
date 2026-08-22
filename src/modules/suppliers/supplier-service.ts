import { cache } from "react";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { suppliers } from "@/core/db/business-schema";
import { supplierInputSchema, type SupplierInput } from "./supplier-input";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";

export function listSuppliers(businessId: string, userId: string) {
  const { sqlite } = getBusinessDb(businessId, userId);
  return sqlite.prepare(`
    SELECT s.*,
      COALESCE((SELECT SUM(base_total_minor) FROM purchase_invoices pi
        WHERE pi.supplier_id = s.id AND pi.document_status = 'posted'), 0) AS total_purchased_minor,
      COALESCE((SELECT SUM(released_carrying_amount_minor) FROM supplier_payments sp
        WHERE sp.supplier_id = s.id AND sp.document_status = 'posted'), 0) AS total_paid_minor
    FROM suppliers s
    ORDER BY s.name
  `).all() as {
    id: string; name: string; email: string | null; phone: string | null;
    tax_reference: string | null; address: string | null; notes: string | null;
    is_active: number; created_at: string; updated_at: string;
    total_purchased_minor: number; total_paid_minor: number;
  }[];
}

export function getSupplier(businessId: string, userId: string, supplierId: string) {
  return getBusinessDb(businessId, userId).db.select().from(suppliers)
    .where(eq(suppliers.id, supplierId)).get() ?? null;
}

export function createSupplier(businessId: string, userId: string, input: SupplierInput) {
  const data = supplierInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const id = randomUUID();
  const now = new Date().toISOString();
  context.db.insert(suppliers).values({
    id,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    taxReference: data.taxReference || null,
    address: data.address || null,
    legalName: data.legalName || null,
    trn: data.trn || null,
    legalRegistrationIdentifier: data.legalRegistrationIdentifier || null,
    electronicAddress: data.electronicAddress || null,
    electronicAddressScheme: data.electronicAddressScheme || null,
    registeredAddress: data.registeredAddress || null,
    countryCode: data.countryCode || null,
    defaultCurrencyCode,
    notes: data.notes || null,
    isActive: data.isActive,
    createdAt: now,
    updatedAt: now,
  }).run();
  return id;
}

export function updateSupplier(
  businessId: string,
  userId: string,
  supplierId: string,
  input: SupplierInput,
) {
  const data = supplierInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const current = context.db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!current) throw new Error("Supplier not found.");
  context.db.update(suppliers).set({
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    taxReference: data.taxReference || null,
    address: data.address || null,
    legalName: data.legalName || null,
    trn: data.trn || null,
    legalRegistrationIdentifier: data.legalRegistrationIdentifier || null,
    electronicAddress: data.electronicAddress || null,
    electronicAddressScheme: data.electronicAddressScheme || null,
    registeredAddress: data.registeredAddress || null,
    countryCode: data.countryCode || null,
    defaultCurrencyCode,
    notes: data.notes || null,
    isActive: data.isActive,
    updatedAt: new Date().toISOString(),
  }).where(eq(suppliers.id, supplierId)).run();
}

export const listActiveSuppliers = cache((businessId: string, userId: string) => {
  return getBusinessDb(businessId, userId).db.select().from(suppliers)
    .where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name)).all();
});
