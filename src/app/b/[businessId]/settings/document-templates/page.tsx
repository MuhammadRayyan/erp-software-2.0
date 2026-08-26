import { requireModule } from "@/core/permissions/require-module";
import { TemplateEditor } from "@/modules/document-templates/template-editor";
import { getTemplateSettings } from "@/modules/document-templates/template-service";
import { SettingsShell } from "@/components/settings-shell";

export default async function DocumentTemplatesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  
  if (access.membership.role !== "administrator") {
    return <div className="page-container">Administrator access is required.</div>;
  }
  
  const settings = getTemplateSettings(businessId, user.id, "sales-invoice");
  
  return (
    <SettingsShell businessId={businessId} title="Invoice Template" description="Customize the appearance of your sales invoice PDFs.">
      <TemplateEditor businessId={businessId} initialSettings={settings} />
    </SettingsShell>
  );
}
