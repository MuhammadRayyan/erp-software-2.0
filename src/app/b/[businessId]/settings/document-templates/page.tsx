import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { TemplateEditor } from "@/modules/document-templates/template-editor";
import { getTemplateSettings } from "@/modules/document-templates/template-service";

export default async function DocumentTemplatesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "settings");
  
  if (access.membership.role !== "administrator") {
    return <div className="page-container">Administrator access is required.</div>;
  }
  
  const settings = getTemplateSettings(businessId, user.id, "sales-invoice");
  
  return (
    <div className="page-container page-wide">
      <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoice Template</h1>
          <p className="page-description">Customize the appearance of your sales invoice PDFs.</p>
        </div>
      </div>
      <TemplateEditor businessId={businessId} initialSettings={settings} />
    </div>
  );
}
