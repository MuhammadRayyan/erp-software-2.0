"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import {
  changeBaseCurrency,
  deleteExchangeRate,
  saveCurrency,
  saveExchangeRate,
  saveRealizedFxAccounts,
} from "./exchange-rate";

type ActionResult = { error?: string };

const currencySchema = z.object({
  code: z.string().trim().length(3),
  name: z.string().trim().min(2).max(80),
  symbol: z.string().trim().max(8).optional(),
  minorUnit: z.coerce.number().int().min(0).max(6),
  isActive: z.boolean(),
});

const rateSchema = z.object({
  currencyCode: z.string().trim().length(3),
  rateDate: z.iso.date(),
  rateToBase: z.string().trim().min(1).max(40),
  source: z.enum(["Manual", "CBUAE"]),
  sourceReference: z.string().trim().max(160).optional(),
});

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function administrator(businessId: string) {
  const context = await requireModule(businessId, "settings");
  if (context.access.membership.role !== "administrator") {
    throw new Error("Only a business Administrator can change currency settings.");
  }
  return context;
}

export async function saveCurrencyAction(businessId: string, input: unknown): Promise<ActionResult> {
  try {
    const { user } = await administrator(businessId);
    saveCurrency(businessId, user.id, currencySchema.parse(input));
    revalidatePath(`/b/${businessId}/settings/currencies`);
    return {};
  } catch (error) { return { error: errorMessage(error, "The currency could not be saved.") }; }
}

export async function saveExchangeRateAction(businessId: string, input: unknown): Promise<ActionResult> {
  try {
    const { user } = await administrator(businessId);
    saveExchangeRate(businessId, user.id, rateSchema.parse(input));
    revalidatePath(`/b/${businessId}/settings/currencies`);
    return {};
  } catch (error) { return { error: errorMessage(error, "The exchange rate could not be saved.") }; }
}

export async function deleteExchangeRateAction(businessId: string, rateId: string): Promise<ActionResult> {
  try {
    const { user } = await administrator(businessId);
    deleteExchangeRate(businessId, user.id, z.string().uuid().parse(rateId));
    revalidatePath(`/b/${businessId}/settings/currencies`);
    return {};
  } catch (error) { return { error: errorMessage(error, "The exchange rate could not be deleted.") }; }
}

export async function changeBaseCurrencyAction(businessId: string, code: string): Promise<ActionResult> {
  try {
    const { user } = await administrator(businessId);
    changeBaseCurrency(businessId, user.id, code);
    revalidatePath(`/b/${businessId}`);
    return {};
  } catch (error) { return { error: errorMessage(error, "The base currency could not be changed.") }; }
}

export async function saveRealizedFxAccountsAction(
  businessId: string,
  input: { gainAccountId: string; lossAccountId: string },
): Promise<ActionResult> {
  try {
    const { user } = await administrator(businessId);
    saveRealizedFxAccounts(businessId, user.id, input);
    revalidatePath(`/b/${businessId}/settings/currencies`);
    return {};
  } catch (error) { return { error: errorMessage(error, "The realized FX accounts could not be saved.") }; }
}
