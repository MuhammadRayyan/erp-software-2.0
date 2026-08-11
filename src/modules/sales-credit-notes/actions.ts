"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { creditNoteInputSchema } from "./credit-note-input";
import { deleteCreditNote, duplicateCreditNote, saveCreditNote, voidCreditNote, type CreditNoteIntent } from "./credit-note-service";

export type CreditNoteActionResult = { error?: string; fieldErrors?: Record<string, string[]> };
export async function saveCreditNoteAction(businessId: string, noteId: string | null, input: unknown, intent: CreditNoteIntent): Promise<CreditNoteActionResult> { const { user } = await requireModule(businessId, "sales"); const parsed = creditNoteInputSchema.safeParse(input); if (!parsed.success) return { error: "Check the credit note fields and lines.", fieldErrors: z.flattenError(parsed.error).fieldErrors }; let id: string; try { id = saveCreditNote(businessId, user.id, parsed.data, intent, noteId ?? undefined); } catch (error) { return { error: error instanceof Error ? error.message : "The credit note could not be saved." }; } redirect(`/b/${businessId}/sales/credit-notes/${id}?notice=${intent === "post" ? "Credit note posted" : "Draft saved"}`); }
export async function duplicateCreditNoteAction(businessId: string, noteId: string) { const { user } = await requireModule(businessId, "sales"); try { const id = duplicateCreditNote(businessId, user.id, noteId); redirect(`/b/${businessId}/sales/credit-notes/${id}?notice=Credit note duplicated as draft`); } catch (error) { return { error: error instanceof Error ? error.message : "The credit note could not be duplicated." }; } }
export async function deleteCreditNoteAction(businessId: string, noteId: string) { const { user } = await requireModule(businessId, "sales"); try { deleteCreditNote(businessId, user.id, noteId); revalidatePath(`/b/${businessId}/sales/credit-notes`); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "The credit note could not be deleted." }; } }
export async function voidCreditNoteAction(businessId: string, noteId: string) { const { user } = await requireModule(businessId, "sales"); try { voidCreditNote(businessId, user.id, noteId); revalidatePath(`/b/${businessId}/sales/credit-notes/${noteId}`); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "The credit note could not be voided." }; } }
