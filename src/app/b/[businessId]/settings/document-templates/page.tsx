import { requireModule } from "@/core/permissions/require-module";
import { TemplateEditor } from "@/modules/document-templates/template-editor";
import { getTemplateSettings } from "@/modules/document-templates/template-service";
import { SettingsShell } from "@/components/settings-shell";
import { TemplateSelector, SUPPORTED_DOCUMENT_TYPES } from "./template-selector";

export default async function DocumentTemplatesPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  
  if (access.membership.role !== "administrator") {
    return <div className="page-container">Administrator access is required.</div>;
  }
  
  const search = await searchParams;
  const documentType = typeof search.type === "string" ? search.type : "sales-invoice";
  const settings = getTemplateSettings(businessId, user.id, documentType);
  const typeLabel = SUPPORTED_DOCUMENT_TYPES.find(t => t.value === documentType)?.label || "Document";
  
  return (
    <SettingsShell businessId={businessId} title="Document Templates" description="Customize the appearance of your document PDFs.">
      <TemplateSelector businessId={businessId} currentType={documentType} />
      <TemplateEditor key={documentType} businessId={businessId} documentType={documentType} initialSettings={settings} />
    </SettingsShell>
  );
}
