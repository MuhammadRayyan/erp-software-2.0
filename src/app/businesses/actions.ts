"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/core/auth/session";
import { businessInputSchema } from "@/core/businesses/business-input";
import {
  archiveBusiness,
  createBusiness,
  deleteBusiness,
  renameBusiness,
} from "@/core/businesses/business-service";

export type ActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createBusinessAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = businessInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const business = createBusiness(parsed.data, user.id);
  redirect(`/b/${business.id}/overview?notice=Business created`);
}

export async function renameBusinessAction(businessId: string, name: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    renameBusiness(businessId, user.id, name);
    revalidatePath("/businesses");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not rename business" };
  }
}

export async function archiveBusinessAction(businessId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    archiveBusiness(businessId, user.id);
    revalidatePath("/businesses");
    return {};
  } catch {
    return { error: "Could not archive business" };
  }
}

export async function deleteBusinessAction(businessId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    deleteBusiness(businessId, user.id);
    revalidatePath("/businesses");
    return {};
  } catch {
    return { error: "Could not delete business" };
  }
}
