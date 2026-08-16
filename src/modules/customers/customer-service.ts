import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { customers } from "@/core/db/business-schema";
import { customerInputSchema, type CustomerInput } from "./customer-input";
import { getBaseCurrency, getCurrency } from "@/modules/currency/currency";

export function listCustomers(businessId: string, userId: string, includeInactive = false) {
  let query = getBusinessDb(businessId, userId).db.select().from(customers);
  if (!includeInactive) {
    query = query.where(eq(customers.isActive, true)) as any;
  }
  return query.orderBy(asc(customers.name)).all();
}

export function getCustomer(businessId: string, userId: string, customerId: string) {
  return getBusinessDb(businessId, userId).db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .get();
}

export function createCustomer(businessId: string, userId: string, input: CustomerInput) {
  const data = customerInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const now = new Date().toISOString();
  const id = randomUUID();
  context.db
    .insert(customers)
    .values({ id, ...data, defaultCurrencyCode, createdAt: now, updatedAt: now, status: "active" })
    .run();
  return id;
}

export function updateCustomer(
  businessId: string,
  userId: string,
  customerId: string,
  input: CustomerInput,
) {
  const data = customerInputSchema.parse(input);
  const context = getBusinessDb(businessId, userId);
  const defaultCurrencyCode = data.defaultCurrencyCode || getBaseCurrency(context.sqlite).code;
  getCurrency(context.sqlite, defaultCurrencyCode, true);
  const current = getCustomer(businessId, userId, customerId);
  if (!current) throw new Error("CUSTOMER_NOT_FOUND");
  context.db
    .update(customers)
    .set({ ...data, defaultCurrencyCode, updatedAt: new Date().toISOString() })
    .where(eq(customers.id, customerId))
    .run();
}
