"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { taxSettingsInputSchema } from "./tax-settings-input";
import { updateTaxSettings } from "./tax-settings-service";
import {
  filedExternallyInputSchema,
  reopenPeriodInputSchema,
  vatAdjustmentInputSchema,
  vatPeriodInputSchema,
} from "./vat-period-input";
import {
  addVatAdjustment,
  createVatPeriod,
  finalizeVatPeriod,
  markVatPeriodFiledExternally,
  markVatPeriodPrepared,
  reopenVatPeriod,
} from "./vat-period-service";

export type TaxActionResult = { error?: string; fieldErrors?: Record<string, string[]>; id?: string };

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function requireTaxAdmin(businessId: string) {
  const context = await requireModule(businessId, "settings");
  if (context.access.membership.role !== "administrator") throw new Error("Only a business Administrator can perform this VAT action.");
  return context;
}

export async function saveTaxSettingsAction(businessId: string, input: unknown): Promise<TaxActionResult> {
  try {
    const { user } = await requireTaxAdmin(businessId);
    const parsed = taxSettingsInputSchema.safeParse(input);
    if (!parsed.success) return { error: "Check the VAT registration settings.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
    updateTaxSettings(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/settings/tax`);
    revalidatePath(`/b/${businessId}/tax/vat`);
    return {};
  } catch (error) { return { error: message(error, "VAT settings could not be saved.") }; }
}

export async function createVatPeriodAction(businessId: string, input: unknown): Promise<TaxActionResult> {
  const { user } = await requireModule(businessId, "reports");
  const parsed = vatPeriodInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the explicit VAT period dates.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    const id = createVatPeriod(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/tax/vat`);
    return { id };
  } catch (error) { return { error: message(error, "The VAT period could not be created.") }; }
}

export async function prepareVatPeriodAction(businessId: string, periodId: string): Promise<TaxActionResult> {
  const { user } = await requireModule(businessId, "reports");
  try { markVatPeriodPrepared(businessId, user.id, periodId); revalidatePath(`/b/${businessId}/tax/vat/periods/${periodId}`); return {}; }
  catch (error) { return { error: message(error, "The VAT period could not be prepared.") }; }
}

export async function addVatAdjustmentAction(businessId: string, periodId: string, input: unknown): Promise<TaxActionResult> {
  try {
    const { user } = await requireTaxAdmin(businessId);
    const parsed = vatAdjustmentInputSchema.safeParse(input);
    if (!parsed.success) return { error: "Check the VAT adjustment fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
    addVatAdjustment(businessId, user.id, periodId, parsed.data);
    revalidatePath(`/b/${businessId}/tax/vat/periods/${periodId}`);
    return {};
  } catch (error) { return { error: message(error, "The VAT adjustment could not be added.") }; }
}

export async function finalizeVatPeriodAction(businessId: string, periodId: string): Promise<TaxActionResult> {
  try { const { user } = await requireTaxAdmin(businessId); finalizeVatPeriod(businessId, user.id, periodId); revalidatePath(`/b/${businessId}/tax/vat`); return {}; }
  catch (error) { return { error: message(error, "The VAT period could not be finalized.") }; }
}

export async function reopenVatPeriodAction(businessId: string, periodId: string, input: unknown): Promise<TaxActionResult> {
  try {
    const { user } = await requireTaxAdmin(businessId);
    const parsed = reopenPeriodInputSchema.safeParse(input);
    if (!parsed.success) return { error: "Enter a reopening reason.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
    reopenVatPeriod(businessId, user.id, periodId, parsed.data);
    revalidatePath(`/b/${businessId}/tax/vat`);
    return {};
  } catch (error) { return { error: message(error, "The VAT period could not be reopened.") }; }
}

export async function fileVatPeriodExternallyAction(businessId: string, periodId: string, input: unknown): Promise<TaxActionResult> {
  try {
    const { user } = await requireTaxAdmin(businessId);
    const parsed = filedExternallyInputSchema.safeParse(input);
    if (!parsed.success) return { error: "Check the external filing details.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
    markVatPeriodFiledExternally(businessId, user.id, periodId, parsed.data);
    revalidatePath(`/b/${businessId}/tax/vat`);
    return {};
  } catch (error) { return { error: message(error, "The external filing record could not be saved.") }; }
}

