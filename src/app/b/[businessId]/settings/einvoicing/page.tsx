import { requireModule } from "@/core/permissions/require-module";
import { EInvoiceSettingsForm } from "@/modules/einvoicing/settings-form";
import { getEInvoiceSettings } from "@/modules/einvoicing/settings-service";
import { SettingsShell } from "@/components/settings-shell";

export default async function EInvoiceSettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  
  if (access.membership.role !== "administrator") {
    return <SettingsShell businessId={businessId} title="Electronic Invoicing" description="Only a business Administrator can change these settings."><></></SettingsShell>;
  }
  
  const settings = getEInvoiceSettings(businessId, user.id);
  return (
    <SettingsShell businessId={businessId} title="Electronic Invoicing" description="Seller readiness, versioned PINT-AE mapping, and a provider-neutral ASP boundary.">
      <EInvoiceSettingsForm businessId={businessId} trn={settings.trn} vatRegistered={settings.vatRegistered} initial={{ enabled: settings.enabled, legalName: settings.legalName, legalRegistrationIdentifier: settings.legalRegistrationIdentifier, addressLine1: settings.addressLine1, city: settings.city, countrySubdivision: settings.countrySubdivision, countryCode: settings.countryCode, participantIdentifier: settings.participantIdentifier, participantIdentifierScheme: settings.participantIdentifierScheme, endpointIdentifier: settings.endpointIdentifier, endpointIdentifierScheme: settings.endpointIdentifierScheme, aspProviderKey: settings.aspProviderKey === "mock" ? "mock" : "", aspEnvironment: settings.aspEnvironment === "mock" ? "mock" : "disabled", specificationVersion: "1.0.4" }} />
    </SettingsShell>
  );
}
