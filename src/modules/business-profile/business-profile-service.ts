import { cache } from "react";
import { eq } from "drizzle-orm";
import { getBusinessDb } from "@/core/db/business";
import { getSystemDb } from "@/core/db/system";
import { businesses } from "@/core/db/system-schema";
import { businessProfile, businessTaxSettings, businessEInvoiceSettings } from "@/core/db/business-schema";
import { getBusinessForUser } from "@/core/businesses/business-service";
import {
  businessProfileInputSchema,
  localizationInputSchema,
  type BusinessProfileInput,
  type LocalizationInput,
} from "./business-profile-input";

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

  let row = db.select().from(businessProfile).where(eq(businessProfile.id, "default")).get();

  if (!row) {
    // If not seeded yet, attempt to read TRN or EInvoice if configured
    let trn = "";
    let defaultEmirate = "";
    try {
      const taxRow = db.select().from(businessTaxSettings).where(eq(businessTaxSettings.id, "default")).get();
      if (taxRow?.trn) trn = taxRow.trn;
      if (taxRow?.defaultSupplyEmirate) defaultEmirate = taxRow.defaultSupplyEmirate;
    } catch { /* ignore */ }

    return {
      id: "default",
      legalName: sysName,
      tradingName: sysName,
      companyRegistrationNumber: "",
      taxId: trn,
      email: "",
      phone: "",
      website: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      stateOrEmirate: defaultEmirate,
      postalCode: "",
      country: sysCountry,
      countryCode: "AE",
      logoUrl: "",
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
    taxId: row.taxId || "",
    email: row.email || "",
    phone: row.phone || "",
    website: row.website || "",
    addressLine1: row.addressLine1 || "",
    addressLine2: row.addressLine2 || "",
    city: row.city || "",
    stateOrEmirate: row.stateOrEmirate || "",
    postalCode: row.postalCode || "",
    country: row.country || sysCountry,
    countryCode: row.countryCode || "AE",
    logoUrl: row.logoUrl || "",
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
  const data = businessProfileInputSchema.parse(input);
  const { db, sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  const existing = db.select().from(businessProfile).where(eq(businessProfile.id, "default")).get();

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
          updated_at = ?
        WHERE id = 'default'
      `)
      .run(
        data.legalName || null,
        data.tradingName || null,
        data.companyRegistrationNumber || null,
        data.taxId || null,
        data.email || null,
        data.phone || null,
        data.website || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.stateOrEmirate || null,
        data.postalCode || null,
        data.country,
        data.countryCode,
        data.logoUrl || null,
        now,
      );
  } else {
    sqlite
      .prepare(`
        INSERT INTO business_profile (
          id, legal_name, trading_name, company_registration_number, tax_id,
          email, phone, website, address_line_1, address_line_2,
          city, state_or_emirate, postal_code, country, country_code,
          logo_url, date_format, time_format, financial_year_start_month,
          created_at, updated_at
        ) VALUES (
          'default', ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, 'DD/MM/YYYY', '12h', 1,
          ?, ?
        )
      `)
      .run(
        data.legalName || null,
        data.tradingName || null,
        data.companyRegistrationNumber || null,
        data.taxId || null,
        data.email || null,
        data.phone || null,
        data.website || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.stateOrEmirate || null,
        data.postalCode || null,
        data.country,
        data.countryCode,
        data.logoUrl || null,
        now,
        now,
      );
  }

  // Cross-module synchronization:
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

  // 2. Sync tax ID (TRN) with businessTaxSettings if non-empty
  if (data.taxId) {
    try {
      sqlite
        .prepare(`UPDATE business_tax_settings SET trn = ?, updated_at = ? WHERE id = 'default'`)
        .run(data.taxId, now);
    } catch { /* ignore */ }
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
        data.stateOrEmirate || null,
        data.countryCode || null,
      );
  } catch { /* ignore */ }

  return getBusinessProfile(businessId, userId);
}

export function updateLocalization(
  businessId: string,
  userId: string,
  input: LocalizationInput,
): ResolvedBusinessProfile {
  const data = localizationInputSchema.parse(input);
  const { sqlite } = getBusinessDb(businessId, userId);
  const now = new Date().toISOString();

  // Ensure default profile exists before updating
  getBusinessProfile(businessId, userId);

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
