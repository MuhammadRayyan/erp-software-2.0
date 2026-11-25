import { assertBusinessAdministrator } from "@/core/permissions/mutation-permissions";
import { getBusinessDb } from "@/core/db/business";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { normalizeEmirateToTitle } from "@/modules/business-profile/business-profile-service";
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
  } | undefined;
  if (!row) {
    return {
      vatRegistered: false,
      trn: null,
      vatRegistrationEffectiveDate: null,
      vatDeregistrationDate: null,
      defaultSupplyEmirate: null,
      taxLockDate: null,
      updatedAt: "",
    };
  }
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
  const { sqlite, business } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();
  const normalizedTrn = data.trn?.trim() || null;
  const normalizedSupplyEmirate = data.vatRegistered
    ? (data.defaultSupplyEmirate || null)
    : (data.defaultSupplyEmirate || null);
  const emirateTitle = normalizedSupplyEmirate ? (normalizeEmirateToTitle(normalizedSupplyEmirate) || null) : null;

  sqlite.transaction(() => {
    sqlite.prepare(`
      INSERT INTO business_tax_settings (
        id, vat_registered, trn, vat_registration_effective_date,
        vat_deregistration_date, default_supply_emirate, created_at, updated_at
      ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        vat_registered = excluded.vat_registered,
        trn = excluded.trn,
        vat_registration_effective_date = excluded.vat_registration_effective_date,
        vat_deregistration_date = excluded.vat_deregistration_date,
        default_supply_emirate = excluded.default_supply_emirate,
        updated_at = excluded.updated_at
    `).run(
      data.vatRegistered ? 1 : 0,
      normalizedTrn,
      data.vatRegistrationEffectiveDate || null,
      data.vatDeregistrationDate || null,
      normalizedSupplyEmirate,
      now,
      now,
    );

    const existingProfile = sqlite
      .prepare(`SELECT id FROM business_profile WHERE id = 'default'`)
      .get() as { id: string } | undefined;

    if (existingProfile) {
      sqlite
        .prepare(
          `UPDATE business_profile SET tax_id = ?, state_or_emirate = COALESCE(?, state_or_emirate), updated_at = ? WHERE id = 'default'`,
        )
        .run(normalizedTrn, emirateTitle, now);
    } else {
      sqlite
        .prepare(`
          INSERT INTO business_profile (
            id, legal_name, trading_name, tax_id, state_or_emirate,
            country, country_code, date_format, time_format, financial_year_start_month,
            created_at, updated_at
          ) VALUES ('default', ?, ?, ?, ?, ?, 'AE', 'DD/MM/YYYY', '12h', ?, ?, ?)
        `)
        .run(
          business.name || null,
          business.name || null,
          normalizedTrn,
          emirateTitle,
          business.country || "United Arab Emirates",
          business.financialYearStartMonth || 1,
          now,
          now,
        );
    }

    try {
      recordActivity(businessId, {
        userId,
        action: "settings_changed",
        entityType: "tax_settings",
        entityId: "default",
        summary: `Updated UAE VAT settings: ${data.vatRegistered ? `VAT Registered (TRN: ${normalizedTrn || "N/A"})` : "VAT Not Registered"}`,
        details: { vatRegistered: data.vatRegistered, trn: normalizedTrn, defaultSupplyEmirate: normalizedSupplyEmirate },
        sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] tax_settings update failed:", e);
    }
  }).immediate();
}

