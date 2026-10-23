"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { debitNoteInputSchema } from "./debit-note-input";
import { deleteDebitNote, duplicateDebitNote, saveDebitNote, voidDebitNote } from "./debit-note-service";

export type DebitNoteActionResult = { error?: string; fieldErrors?: Record<string, string[]> };
export async function saveDebitNoteAction(
  businessId: string,
  noteId: string | null,
  input: unknown,
  intent: "draft" | "post"
): Promise<DebitNoteActionResult> {
  const { user } = await requireModule(businessId, "purchases");
  const parsed = debitNoteInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Check the debit note fields and lines.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  let id: string;
  try {
    id = saveDebitNote(businessId, user.id, parsed.data, intent, noteId ?? undefined);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The debit note could not be saved.",
    };
  }
  revalidatePath(`/b/${businessId}/purchases/debit-notes`);
  if (noteId) revalidatePath(`/b/${businessId}/purchases/debit-notes/${noteId}`);
  revalidatePath(`/b/${businessId}/purchases/debit-notes/${id}`);
  redirect(
    `/b/${businessId}/purchases/debit-notes/${id}?notice=${
      intent === "post" ? "Debit note posted" : "Draft saved"
    }`
  );
}

export async function duplicateDebitNoteAction(businessId: string, noteId: string) {
  const { user } = await requireModule(businessId, "purchases");
  let id: string;
  try {
    id = duplicateDebitNote(businessId, user.id, noteId);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The debit note could not be duplicated.",
    };
  }
  revalidatePath(`/b/${businessId}/purchases/debit-notes`);
  revalidatePath(`/b/${businessId}/purchases/debit-notes/${id}`);
  redirect(`/b/${businessId}/purchases/debit-notes/${id}?notice=Debit note duplicated as draft`);
}

export async function deleteDebitNoteAction(businessId: string, noteId: string) {
  const { user } = await requireModule(businessId, "purchases");
  try {
    deleteDebitNote(businessId, user.id, noteId);
    revalidatePath(`/b/${businessId}/purchases/debit-notes`);
    return {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The debit note could not be deleted.",
    };
  }
}

export async function voidDebitNoteAction(businessId: string, noteId: string) {
  const { user } = await requireModule(businessId, "purchases");
  try {
    voidDebitNote(businessId, user.id, noteId);
    revalidatePath(`/b/${businessId}/purchases/debit-notes`);
    revalidatePath(`/b/${businessId}/purchases/debit-notes/${noteId}`);
    return {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The debit note could not be voided.",
    };
  }
}
