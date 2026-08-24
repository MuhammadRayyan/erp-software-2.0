import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { CustomFieldsManager } from "@/modules/custom-fields/custom-field-form";
import { listCustomFieldDefinitions } from "@/modules/custom-fields/custom-field-service";

export default async function CustomFieldsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "settings");
  const definitions = listCustomFieldDefinitions(businessId, user.id);
  return (
    <div className="page-container">
      <Link href={`/b/${businessId}/settings`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Settings</Link>
      <div className="page-header"><div><h1 className="page-title">Custom Fields</h1><p className="page-description">Add extra fields to customers, suppliers, and sales invoices.</p></div></div>
      <CustomFieldsManager businessId={businessId} definitions={definitions} />
    </div>
  );
}
