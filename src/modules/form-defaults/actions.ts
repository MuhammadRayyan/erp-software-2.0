"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { saveFormDefaults, type FormDefaultValues } from "./form-defaults-service";

export async function saveFormDefaultsAction(
  businessId: string,
  formType: string,
  values: FormDefaultValues,
) {
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access) throw new Error("Business not found.");
  saveFormDefaults(businessId, user.id, formType, values);
  revalidatePath(`/b/${businessId}/settings/form-defaults/${formType}`);
}
