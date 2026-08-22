import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { EInvoiceSettingsForm } from "@/modules/einvoicing/settings-form";
import { getEInvoiceSettings } from "@/modules/einvoicing/settings-service";

export default async function EInvoiceSettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  if (access.membership.role !== "administrator") return <div className="page-container"><h1 className="page-title">Electronic Invoicing</h1><p className="page-description">Only a business Administrator can change these settings.</p></div>;
  const settings = getEInvoiceSettings(businessId, user.id);
  return <div className="page-container page-narrow">
    <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Settings</Link>
    <div className="mb-7"><h1 className="page-title">Electronic Invoicing</h1><p className="page-description">Seller readiness, versioned PINT-AE mapping, and a provider-neutral ASP boundary.</p></div>
    <EInvoiceSettingsForm businessId={businessId} trn={settings.trn} vatRegistered={settings.vatRegistered} initial={{ enabled: settings.enabled, legalName: settings.legalName, legalRegistrationIdentifier: settings.legalRegistrationIdentifier, addressLine1: settings.addressLine1, city: settings.city, countrySubdivision: settings.countrySubdivision, countryCode: settings.countryCode, participantIdentifier: settings.participantIdentifier, participantIdentifierScheme: settings.participantIdentifierScheme, endpointIdentifier: settings.endpointIdentifier, endpointIdentifierScheme: settings.endpointIdentifierScheme, aspProviderKey: settings.aspProviderKey === "mock" ? "mock" : "", aspEnvironment: settings.aspEnvironment === "mock" ? "mock" : "disabled", specificationVersion: "1.0.4" }} />
  </div>;
}
