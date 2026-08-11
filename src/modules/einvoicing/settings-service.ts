import { getBusinessDb } from "@/core/db/business";
import { eInvoiceSettingsInputSchema, type EInvoiceSettingsInput } from "./settings-input";

export function getEInvoiceSettings(businessId: string, userId: string) {
  const row = getBusinessDb(businessId, userId).sqlite.prepare(`
    SELECT eis.*, ts.vat_registered, ts.trn
    FROM business_einvoice_settings eis
    INNER JOIN business_tax_settings ts ON ts.id = 'default'
    WHERE eis.id = 'default'
  `).get() as Record<string, string | number | null>;
  return {
    enabled: Boolean(row.enabled),
    legalName: String(row.legal_name ?? ""),
    legalRegistrationIdentifier: String(row.legal_registration_identifier ?? ""),
    addressLine1: String(row.address_line_1 ?? ""),
    city: String(row.city ?? ""),
    countrySubdivision: String(row.country_subdivision ?? ""),
    countryCode: String(row.country_code ?? "AE"),
    participantIdentifier: String(row.participant_identifier ?? ""),
    participantIdentifierScheme: String(row.participant_identifier_scheme ?? ""),
    endpointIdentifier: String(row.endpoint_identifier ?? ""),
    endpointIdentifierScheme: String(row.endpoint_identifier_scheme ?? ""),
    aspProviderKey: String(row.asp_provider_key ?? ""),
    aspEnvironment: String(row.asp_environment ?? "disabled") as "disabled" | "mock" | "sandbox" | "production",
    specificationVersion: String(row.specification_version),
    vatRegistered: Boolean(row.vat_registered),
    trn: String(row.trn ?? ""),
    updatedAt: String(row.updated_at),
  };
}

export function updateEInvoiceSettings(businessId: string, userId: string, input: EInvoiceSettingsInput) {
  const data = eInvoiceSettingsInputSchema.parse(input);
  getBusinessDb(businessId, userId).sqlite.prepare(`
    UPDATE business_einvoice_settings
    SET enabled = ?, legal_name = ?, legal_registration_identifier = ?, address_line_1 = ?,
        city = ?, country_subdivision = ?, country_code = ?, participant_identifier = ?,
        participant_identifier_scheme = ?, endpoint_identifier = ?, endpoint_identifier_scheme = ?,
        asp_provider_key = ?, asp_environment = ?, specification_version = ?, updated_at = ?
    WHERE id = 'default'
  `).run(
    data.enabled ? 1 : 0,
    data.legalName || null,
    data.legalRegistrationIdentifier || null,
    data.addressLine1 || null,
    data.city || null,
    data.countrySubdivision || null,
    data.countryCode,
    data.participantIdentifier || null,
    data.participantIdentifierScheme || null,
    data.endpointIdentifier || null,
    data.endpointIdentifierScheme || null,
    data.aspProviderKey || null,
    data.aspEnvironment,
    data.specificationVersion,
    new Date().toISOString(),
  );
}
