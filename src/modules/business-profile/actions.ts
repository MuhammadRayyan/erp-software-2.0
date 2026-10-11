"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import {
  businessProfileInputSchema,
  localizationInputSchema,
  type BusinessProfileInput,
  type LocalizationInput,
} from "./business-profile-input";
import { updateBusinessProfile, updateLocalization } from "./business-profile-service";

export async function updateBusinessProfileAction(businessId: string, input: BusinessProfileInput) {
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access || access.membership.role !== "administrator") {
    return { error: "Administrator access is required to update organization settings." };
  }

  const parsed = businessProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const profile = updateBusinessProfile(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/settings`);
    revalidatePath(`/b/${businessId}/settings/business-profile`);
    revalidatePath(`/b/${businessId}/settings/localization`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true, profile };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update business profile." };
  }
}

export async function updateLocalizationAction(businessId: string, input: LocalizationInput) {
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access || access.membership.role !== "administrator") {
    return { error: "Administrator access is required to update localization settings." };
  }

  const parsed = localizationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please check the form for errors.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const profile = updateLocalization(businessId, user.id, parsed.data);
    revalidatePath(`/b/${businessId}/settings`);
    revalidatePath(`/b/${businessId}/settings/localization`);
    revalidatePath(`/b/${businessId}/overview`);
    return { ok: true, profile };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update localization settings." };
  }
}
