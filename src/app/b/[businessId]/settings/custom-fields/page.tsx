import { SettingsShell } from "@/components/settings-shell";
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
    <SettingsShell businessId={businessId} title="Custom Fields" description="Add extra fields to customers, suppliers, and sales invoices.">
      <CustomFieldsManager businessId={businessId} definitions={definitions} />
    </SettingsShell>
  );
}
