import { assertBusinessAdministrator } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { taxSettingsInputSchema, type TaxSettingsInput } from "./tax-settings-input";

export function getTaxSettings(businessId: string, userId: string) {
  const row = getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT * FROM business_tax_settings WHERE id = 'default'
  `).get() as {
    vat_registered: number;
    trn: string | null;
    vat_registration_effective_date: string | null;
    vat_deregistration_date: string | null;
    default_supply_emirate: string | null;
    tax_lock_date: string | null;
    updated_at: string;
  };
  return {
    vatRegistered: Boolean(row.vat_registered),
    trn: row.trn,
    vatRegistrationEffectiveDate: row.vat_registration_effective_date,
    vatDeregistrationDate: row.vat_deregistration_date,
    defaultSupplyEmirate: row.default_supply_emirate,
    taxLockDate: row.tax_lock_date,
    updatedAt: row.updated_at,
  };
}

export function updateTaxSettings(
  businessId: string,
  userId: string,
  input: TaxSettingsInput,
) {
  assertBusinessAdministrator(businessId, userId);
  const data = taxSettingsInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  sqlite.prepare(`
    UPDATE business_tax_settings
    SET vat_registered = ?, trn = ?, vat_registration_effective_date = ?,
        vat_deregistration_date = ?, default_supply_emirate = ?, updated_at = ?
    WHERE id = 'default'
  `).run(data.vatRegistered ? 1 : 0, data.trn || null,
    data.vatRegistrationEffectiveDate || null, data.vatDeregistrationDate || null,
    data.defaultSupplyEmirate || null, new Date().toISOString());

  try {
    recordActivity(businessId, {
      userId,
      action: "settings_changed",
      entityType: "tax_settings",
      entityId: "default",
      summary: `Updated UAE VAT settings: ${data.vatRegistered ? `VAT Registered (TRN: ${data.trn || "N/A"})` : "VAT Not Registered"}`,
      details: { vatRegistered: data.vatRegistered, trn: data.trn, defaultSupplyEmirate: data.defaultSupplyEmirate },
      sqlite,
    });
  } catch (e) {
    console.error("[ActivityLog] tax_settings update failed:", e);
  }
}

