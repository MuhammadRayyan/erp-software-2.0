import { assertBusinessAdministrator } from "@/core/permissions/mutation-permissions";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { getSystemDb } from "@/core/db/system";
import { businesses } from "@/core/db/system-schema";
import { businessProfile, businessTaxSettings } from "@/core/db/business-schema";
import { recordActivity } from "@/modules/activity-log/activity-log-service";
import { getBusinessForUser } from "@/core/businesses/business-service";
import {
  businessProfileInputSchema,
  localizationInputSchema,
  type BusinessProfileInput,
  type LocalizationInput,
} from "./business-profile-input";
import { normalizeTrnInput, validateUaeTrn } from "@/modules/tax/trn-validation";
import { emirateLabels, type Emirate } from "@/modules/tax/uae-vat-config";

const EMIRATE_TITLE_TO_SLUG: Record<string, Emirate> = Object.fromEntries(
  Object.entries(emirateLabels).map(([slug, label]) => [label.toLowerCase(), slug as Emirate]),
);

export function normalizeEmirateToTitle(val?: string | null): string {
  if (!val) return "";
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (lower in emirateLabels) return emirateLabels[lower as Emirate];
  if (lower in EMIRATE_TITLE_TO_SLUG) return emirateLabels[EMIRATE_TITLE_TO_SLUG[lower]];
  return trimmed;
}

export function normalizeEmirateToSlug(val?: string | null): Emirate | null {
  if (!val) return null;
  const lower = val.trim().toLowerCase();
  if (lower in emirateLabels) return lower as Emirate;
  if (lower in EMIRATE_TITLE_TO_SLUG) return EMIRATE_TITLE_TO_SLUG[lower];
  return null;
}

export type ResolvedBusinessProfile = {
  id: string;
  legalName: string;
  tradingName: string;
  companyRegistrationNumber: string;
  taxId: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateOrEmirate: string;
  postalCode: string;
  country: string;
  countryCode: string;
  logoUrl: string;
  molEstablishmentId: string;
  wpsBankRoutingCode: string;
  dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "DD MMM YYYY";
  timeFormat: "12h" | "24h";
  financialYearStartMonth: number;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
};

export const getBusinessProfile = cache((businessId: string, userId: string): ResolvedBusinessProfile => {
  const { db } = getBusinessDb(businessId, userId);
  const sysAccess = getBusinessForUser(businessId, userId);
  const baseCurrency = sysAccess?.business.currency ?? "AED";
  const sysName = sysAccess?.business.name ?? "";
  const sysCountry = sysAccess?.business.country ?? "United Arab Emirates";
  const sysFiscalMonth = sysAccess?.business.financialYearStartMonth ?? 1;

  const row = db.select().from(businessProfile).where(eq(businessProfile.id, "default")).get();
  let taxTrn = "";
  let taxEmirateTitle = "";
  try {
    const taxRow = db.select().from(businessTaxSettings).where(eq(businessTaxSettings.id, "default")).get();
    if (taxRow?.trn) taxTrn = taxRow.trn;
    if (taxRow?.defaultSupplyEmirate) taxEmirateTitle = normalizeEmirateToTitle(taxRow.defaultSupplyEmirate);
  } catch { /* ignore */ }

  if (!row) {
    return {
      id: "default",
      legalName: sysName,
      tradingName: sysName,
      companyRegistrationNumber: "",
      taxId: taxTrn,
      email: "",
      phone: "",
      website: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      stateOrEmirate: taxEmirateTitle,
      postalCode: "",
      country: sysCountry,
      countryCode: "AE",
      logoUrl: "",
      molEstablishmentId: "",
      wpsBankRoutingCode: "",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12h",
      financialYearStartMonth: sysFiscalMonth,
      baseCurrency,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const validDateFormats = ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD MMM YYYY"] as const;
  const dateFormat = (validDateFormats as readonly string[]).includes(row.dateFormat)
    ? (row.dateFormat as ResolvedBusinessProfile["dateFormat"])
    : "DD/MM/YYYY";

  return {
    id: row.id,
    legalName: row.legalName || sysName,
    tradingName: row.tradingName || sysName,
    companyRegistrationNumber: row.companyRegistrationNumber || "",
    taxId: row.taxId || taxTrn || "",
    email: row.email || "",
    phone: row.phone || "",
    website: row.website || "",
    addressLine1: row.addressLine1 || "",
    addressLine2: row.addressLine2 || "",
    city: row.city || "",
    stateOrEmirate: normalizeEmirateToTitle(row.stateOrEmirate) || taxEmirateTitle || "",
    postalCode: row.postalCode || "",
    country: row.country || sysCountry,
    countryCode: row.countryCode || "AE",
    logoUrl: row.logoUrl || "",
    molEstablishmentId: row.molEstablishmentId || "",
    wpsBankRoutingCode: row.wpsBankRoutingCode || "",
    dateFormat,
    timeFormat: row.timeFormat === "24h" ? "24h" : "12h",
    financialYearStartMonth: row.financialYearStartMonth || sysFiscalMonth,
    baseCurrency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
});

export function updateBusinessProfile(
  businessId: string,
  userId: string,
  input: BusinessProfileInput,
): ResolvedBusinessProfile {
  assertBusinessAdministrator(businessId, userId);
  const rawInput = (input ?? {}) as Record<string, unknown>;
  const hasTaxId = Object.prototype.hasOwnProperty.call(rawInput, "taxId") && rawInput.taxId !== undefined;
  const hasEmirate =
    Object.prototype.hasOwnProperty.call(rawInput, "stateOrEmirate") && rawInput.stateOrEmirate !== undefined;

  const data = businessProfileInputSchema.parse(input);
  const { db, sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  const normalizedTaxId = hasTaxId ? normalizeTrnInput(data.taxId ?? "") || null : undefined;
  const normalizedEmirateTitle = hasEmirate
    ? normalizeEmirateToTitle(data.stateOrEmirate) || (data.stateOrEmirate.trim() || null)
    : undefined;

  sqlite.transaction(() => {
    const existing = db.select().from(businessProfile).where(eq(businessProfile.id, "default")).get();
    let taxRow: { vat_registered: number; trn: string | null; default_supply_emirate: string | null } | undefined;
    try {
      taxRow = sqlite
        .prepare(`SELECT vat_registered, trn, default_supply_emirate FROM business_tax_settings WHERE id = 'default'`)
        .get() as typeof taxRow;
    } catch {
      taxRow = undefined;
    }

    if (hasTaxId && taxRow?.vat_registered === 1) {
      if (!normalizedTaxId) {
        throw new Error("A 15-digit UAE TRN is required while VAT registration is enabled.");
      }
      const check = validateUaeTrn(normalizedTaxId);
      if (!check.validFormat) {
        throw new Error(check.message);
      }
    }

    const effectiveTaxId = hasTaxId ? (normalizedTaxId ?? null) : (existing?.taxId || taxRow?.trn || null);
    const effectiveEmirate = hasEmirate ? (normalizedEmirateTitle ?? null) : (existing?.stateOrEmirate || null);

    if (existing) {
      sqlite
        .prepare(`
          UPDATE business_profile SET
            legal_name = ?,
            trading_name = ?,
            company_registration_number = ?,
            tax_id = ?,
            email = ?,
            phone = ?,
            website = ?,
            address_line_1 = ?,
            address_line_2 = ?,
            city = ?,
            state_or_emirate = ?,
            postal_code = ?,
            country = ?,
            country_code = ?,
            logo_url = ?,
            mol_establishment_id = ?,
            wps_bank_routing_code = ?,
            updated_at = ?
          WHERE id = 'default'
        `)
        .run(
          data.legalName || null,
          data.tradingName || null,
          data.companyRegistrationNumber || null,
          effectiveTaxId,
          data.email || null,
          data.phone || null,
          data.website || null,
          data.addressLine1 || null,
          data.addressLine2 || null,
          data.city || null,
          effectiveEmirate,
          data.postalCode || null,
          data.country,
          data.countryCode,
          data.logoUrl || null,
          data.molEstablishmentId || null,
          data.wpsBankRoutingCode || null,
          now,
        );
    } else {
      sqlite
        .prepare(`
          INSERT INTO business_profile (
            id, legal_name, trading_name, company_registration_number, tax_id,
            email, phone, website, address_line_1, address_line_2,
            city, state_or_emirate, postal_code, country, country_code,
            logo_url, mol_establishment_id, wps_bank_routing_code,
            date_format, time_format, financial_year_start_month,
            created_at, updated_at
          ) VALUES (
            'default', ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            'DD/MM/YYYY', '12h', 1,
            ?, ?
          )
        `)
        .run(
          data.legalName || null,
          data.tradingName || null,
          data.companyRegistrationNumber || null,
          effectiveTaxId,
          data.email || null,
          data.phone || null,
          data.website || null,
          data.addressLine1 || null,
          data.addressLine2 || null,
          data.city || null,
          effectiveEmirate,
          data.postalCode || null,
          data.country,
          data.countryCode,
          data.logoUrl || null,
          data.molEstablishmentId || null,
          data.wpsBankRoutingCode || null,
          now,
          now,
        );
    }

    // 2. Bidirectional sync with businessTaxSettings when taxId or stateOrEmirate is provided
    if (hasTaxId || hasEmirate) {
      const nextTrn = hasTaxId ? (normalizedTaxId ?? null) : (taxRow?.trn ?? null);
      const emirateSlug = hasEmirate ? normalizeEmirateToSlug(data.stateOrEmirate) : undefined;
      const nextSupplyEmirate = hasEmirate ? (emirateSlug ?? null) : (taxRow?.default_supply_emirate ?? null);
      try {
        sqlite
          .prepare(`
            INSERT INTO business_tax_settings (
              id, vat_registered, trn, default_supply_emirate, created_at, updated_at
            ) VALUES ('default', 0, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              trn = excluded.trn,
              default_supply_emirate = excluded.default_supply_emirate,
              updated_at = excluded.updated_at
          `)
          .run(nextTrn, nextSupplyEmirate, now, now);
      } catch { /* ignore if schema missing */ }
    }

    // 3. Sync with businessEInvoiceSettings if present
    try {
      sqlite
        .prepare(`
          UPDATE business_einvoice_settings SET
            legal_name = COALESCE(?, legal_name),
            legal_registration_identifier = COALESCE(?, legal_registration_identifier),
            address_line_1 = COALESCE(?, address_line_1),
            city = COALESCE(?, city),
            country_subdivision = COALESCE(?, country_subdivision),
            country_code = COALESCE(?, country_code)
          WHERE id = 'default'
        `)
        .run(
          data.legalName || null,
          data.companyRegistrationNumber || null,
          data.addressLine1 || null,
          data.city || null,
          effectiveEmirate,
          data.countryCode || null,
        );
    } catch { /* ignore */ }

    try {
      recordActivity(businessId, {
        userId,
        action: "settings_changed",
        entityType: "business_profile",
        entityId: "default",
        summary: `Updated business profile "${data.tradingName || data.legalName || "Workspace"}"`,
        details: { legalName: data.legalName, tradingName: data.tradingName, trn: effectiveTaxId, country: data.country },
        sqlite,
      });
    } catch (e) {
      console.error("[ActivityLog] business_profile update failed:", e);
    }
  }).immediate();

  // 1. Sync primary business name to system DB if tradingName or legalName provided
  const preferredName = (data.tradingName || data.legalName)?.trim();
  if (preferredName && preferredName.length >= 2) {
    try {
      getSystemDb()
        .update(businesses)
        .set({ name: preferredName, updatedAt: now })
        .where(eq(businesses.id, businessId))
        .run();
    } catch { /* ignore */ }
  }

  return getBusinessProfile(businessId, userId);
}

export function updateLocalization(
  businessId: string,
  userId: string,
  input: LocalizationInput,
): ResolvedBusinessProfile {
  assertBusinessAdministrator(businessId, userId);
  const data = localizationInputSchema.parse(input);
  const { db, sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  const existing = db.select().from(businessProfile).where(eq(businessProfile.id, "default")).get();
  if (existing) {
    sqlite
      .prepare(`
        UPDATE business_profile SET
          date_format = ?,
          time_format = ?,
          financial_year_start_month = ?,
          updated_at = ?
        WHERE id = 'default'
      `)
      .run(data.dateFormat, data.timeFormat, data.financialYearStartMonth, now);
  } else {
    const current = getBusinessProfile(businessId, userId);
    sqlite
      .prepare(`
        INSERT INTO business_profile (
          id, legal_name, trading_name, tax_id, state_or_emirate, country, country_code,
          date_format, time_format, financial_year_start_month,
          created_at, updated_at
        ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        current.legalName || null,
        current.tradingName || null,
        current.taxId || null,
        current.stateOrEmirate || null,
        current.country,
        current.countryCode,
        data.dateFormat,
        data.timeFormat,
        data.financialYearStartMonth,
        now,
        now,
      );
  }

  // Sync financial year start month to system DB
  try {
    getSystemDb()
      .update(businesses)
      .set({ financialYearStartMonth: data.financialYearStartMonth, updatedAt: now })
      .where(eq(businesses.id, businessId))
      .run();
  } catch { /* ignore */ }

  return getBusinessProfile(businessId, userId);
}
