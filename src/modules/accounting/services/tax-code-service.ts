import { randomUUID } from "node:crypto";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { accounts, taxCodes } from "@/core/db/business-schema";
import { taxCodeInputSchema, type TaxCodeInput } from "../tax-code-input";

function rateToBasisPoints(rate: string) {
  const [whole, fraction = ""] = rate.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error("Tax rate must be between 0% and 100%.");
  }
  return value;
}

function validateTaxAccount(
  businessId: string,
  userId: string,
  rateBasisPoints: number,
  accountId: string,
  expectedType: "asset" | "liability",
  label: string,
) {
  if (rateBasisPoints === 0 || !accountId) return null;
  const account = getBusinessDb(businessId, userId).db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  if (!account || !account.isActive || account.type !== expectedType) {
    throw new Error(`The selected ${label} is missing, inactive, or not an ${expectedType}.`);
  }
  return account.id;
}

export const listTaxCodes = cache((businessId: string, userId: string) => {
  return getBusinessDb(businessId, userId).db
    .select()
    .from(taxCodes)
    .orderBy(asc(taxCodes.rateBasisPoints), asc(taxCodes.name))
    .all();
});

export function createTaxCode(businessId: string, userId: string, input: TaxCodeInput) {
  const data = taxCodeInputSchema.parse(input);
  const rateBasisPoints = rateToBasisPoints(data.rate);
  validateClassification(data.vatCategory, data.direction, rateBasisPoints, data.isRecoverable);
  const salesTaxAccountId = validateTaxAccount(
    businessId,
    userId,
    rateBasisPoints,
    data.salesTaxAccountId,
    "liability",
    "a sales tax liability account",
  );
  const purchaseTaxAccountId = validateTaxAccount(
    businessId,
    userId,
    rateBasisPoints,
    data.purchaseTaxAccountId,
    "asset",
    "a purchase tax asset account",
  );
  validateRequiredMappings(data, rateBasisPoints, salesTaxAccountId, purchaseTaxAccountId);
  const now = new Date().toISOString();
  getBusinessDb(businessId, userId).db
    .insert(taxCodes)
    .values({
      id: randomUUID(),
      name: data.name,
      rateBasisPoints,
      direction: data.direction,
      vatCategory: data.vatCategory,
      salesTaxAccountId,
      purchaseTaxAccountId,
      isRecoverable: data.isRecoverable,
      isActive: data.isActive,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export function updateTaxCode(
  businessId: string,
  userId: string,
  taxCodeId: string,
  input: TaxCodeInput,
) {
  const data = taxCodeInputSchema.parse(input);
  const rateBasisPoints = rateToBasisPoints(data.rate);
  validateClassification(data.vatCategory, data.direction, rateBasisPoints, data.isRecoverable);
  const salesTaxAccountId = validateTaxAccount(
    businessId,
    userId,
    rateBasisPoints,
    data.salesTaxAccountId,
    "liability",
    "a sales tax liability account",
  );
  const purchaseTaxAccountId = validateTaxAccount(
    businessId,
    userId,
    rateBasisPoints,
    data.purchaseTaxAccountId,
    "asset",
    "a purchase tax asset account",
  );
  validateRequiredMappings(data, rateBasisPoints, salesTaxAccountId, purchaseTaxAccountId);
  const context = getBusinessDb(businessId, userId);
  const current = context.db.select().from(taxCodes).where(eq(taxCodes.id, taxCodeId)).get();
  if (!current) throw new Error("Tax code not found.");
  context.db
    .update(taxCodes)
    .set({
      name: data.name,
      rateBasisPoints,
      direction: data.direction,
      vatCategory: data.vatCategory,
      salesTaxAccountId,
      purchaseTaxAccountId,
      isRecoverable: data.isRecoverable,
      isActive: data.isActive,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(taxCodes.id, taxCodeId))
    .run();
}

// Push the is_active filter to SQL instead of JS to avoid a full table scan.
// Also cached so repeated calls within the same request are free.
export const getActiveTaxCodes = cache((businessId: string, userId: string) => {
  return getBusinessDb(businessId, userId).db
    .select()
    .from(taxCodes)
    .where(eq(taxCodes.isActive, true))
    .orderBy(asc(taxCodes.rateBasisPoints), asc(taxCodes.name))
    .all();
});

function validateClassification(
  category: "standard" | "zero_rated" | "exempt" | "out_of_scope" | "reverse_charge" | "import",
  direction: "sales" | "purchases" | "both",
  rateBasisPoints: number,
  isRecoverable: boolean,
) {
  if (["zero_rated", "exempt", "out_of_scope"].includes(category) && rateBasisPoints !== 0) {
    throw new Error("Zero Rated, Exempt, and Out-of-Scope tax codes must use a 0% rate.");
  }
  if (["reverse_charge", "import"].includes(category) && direction === "sales") {
    throw new Error("Reverse-Charge and Import tax codes must support Purchases.");
  }
  if (isRecoverable && direction === "sales") {
    throw new Error("A Sales-only tax code cannot be marked recoverable.");
  }
}

function validateRequiredMappings(
  data: ReturnType<typeof taxCodeInputSchema.parse>,
  rateBasisPoints: number,
  salesTaxAccountId: string | null,
  purchaseTaxAccountId: string | null,
) {
  if (rateBasisPoints === 0) return;
  if (["sales", "both"].includes(data.direction) && data.vatCategory !== "import" && !salesTaxAccountId) {
    throw new Error("Choose a sales tax liability account for this tax code.");
  }
  if (["purchases", "both"].includes(data.direction) && data.isRecoverable && !purchaseTaxAccountId) {
    throw new Error("Choose a purchase tax asset account for recoverable VAT.");
  }
  if (data.vatCategory === "reverse_charge" && !salesTaxAccountId) {
    throw new Error("Reverse-Charge tax codes require an output VAT liability account.");
  }
}
