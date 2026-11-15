import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { formDefaults } from "@/core/db/business-schema";
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import {
  NAV_CUSTOMIZATION_FORM_TYPE,
  normalizeHiddenNavPaths,
  type NavCustomizationPayload,
} from "@/components/app-shell/nav-customization";

/** Load the list of hidden sidebar module/sub-module paths for a business. */
export function getHiddenNavPaths(businessId: string, userId: string): string[] {
  const { db } = getBusinessDb(businessId, userId);
  const row = db
    .select()
    .from(formDefaults)
    .where(eq(formDefaults.formType, NAV_CUSTOMIZATION_FORM_TYPE))
    .get();
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.payloadJson) as Partial<NavCustomizationPayload>;
    return normalizeHiddenNavPaths(parsed?.hiddenPaths);
  } catch {
    return [];
  }
}

/** Save hidden navigation paths for a business in `form_defaults` without modifying user `FORM_TYPES`. */
export function saveHiddenNavPaths(
  businessId: string,
  userId: string,
  rawHiddenPaths: unknown,
): string[] {
  assertMutationPermission(businessId, userId, "settings", "edit");
  const hiddenPaths = normalizeHiddenNavPaths(rawHiddenPaths);
  const payloadJson = JSON.stringify({ hiddenPaths } satisfies NavCustomizationPayload);
  if (payloadJson.length > 16_384) {
    throw new Error("Navigation customization payload exceeds size limit.");
  }

  const { db, sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(formDefaults)
    .where(eq(formDefaults.formType, NAV_CUSTOMIZATION_FORM_TYPE))
    .get();

  if (existing) {
    sqlite
      .prepare("UPDATE form_defaults SET payload_json = ?, updated_at = ? WHERE form_type = ?")
      .run(payloadJson, now, NAV_CUSTOMIZATION_FORM_TYPE);
  } else {
    sqlite
      .prepare("INSERT INTO form_defaults (id, form_type, payload_json, updated_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), NAV_CUSTOMIZATION_FORM_TYPE, payloadJson, now);
  }

  return hiddenPaths;
}
