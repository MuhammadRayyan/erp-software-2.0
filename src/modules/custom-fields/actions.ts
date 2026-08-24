"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  moveCustomFieldDefinition,
  updateCustomFieldDefinition,
} from "./custom-field-service";
import { customFieldDefinitionSchema } from "./custom-field-input";

export type CustomFieldActionResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createCustomFieldAction(
  businessId: string,
  input: unknown,
): Promise<CustomFieldActionResult> {
  const { user } = await requireModule(businessId, "settings");
  const parsed = customFieldDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the custom field entries.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    createCustomFieldDefinition(businessId, user.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The custom field could not be created." };
  }
  revalidatePath(`/b/${businessId}/settings/custom-fields`);
  return {};
}

export async function updateCustomFieldAction(
  businessId: string,
  definitionId: string,
  input: unknown,
): Promise<CustomFieldActionResult> {
  const { user } = await requireModule(businessId, "settings");
  const parsed = customFieldDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Check the custom field entries.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    updateCustomFieldDefinition(businessId, user.id, definitionId, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The custom field could not be updated." };
  }
  revalidatePath(`/b/${businessId}/settings/custom-fields`);
  return {};
}

export async function deleteCustomFieldAction(
  businessId: string,
  definitionId: string,
): Promise<CustomFieldActionResult> {
  const { user } = await requireModule(businessId, "settings");
  try {
    deleteCustomFieldDefinition(businessId, user.id, definitionId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The custom field could not be deleted." };
  }
  revalidatePath(`/b/${businessId}/settings/custom-fields`);
  return {};
}

export async function moveCustomFieldAction(
  businessId: string,
  definitionId: string,
  direction: "up" | "down",
): Promise<CustomFieldActionResult> {
  const { user } = await requireModule(businessId, "settings");
  try {
    moveCustomFieldDefinition(businessId, user.id, definitionId, direction);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The custom field could not be moved." };
  }
  revalidatePath(`/b/${businessId}/settings/custom-fields`);
  return {};
}
