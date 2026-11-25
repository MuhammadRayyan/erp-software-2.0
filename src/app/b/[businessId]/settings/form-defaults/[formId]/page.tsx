import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import { getFormDefaults, isFormType } from "@/modules/form-defaults/form-defaults-service";
import { FormDefaultsEditor } from "@/modules/form-defaults/form-defaults-editor";

const FORM_LABELS: Record<string, string> = {
  "sales-quote": "Sales Quote",
  "sales-order": "Sales Order",
  "sales-invoice": "Sales Invoice",
  "sales-credit-note": "Sales Credit Note",
  "delivery-note": "Delivery Note",
  "purchase-quote": "Purchase Quote",
  "purchase-order": "Purchase Order",
  "purchase-invoice": "Purchase Invoice",
  "debit-note": "Debit Note",
  "goods-receipt": "Goods Receipt",
  "stock-adjustment": "Stock Adjustment",
};

export default async function FormDefaultsDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; formId: string }>;
}) {
  const { businessId, formId } = await params;
  const { user } = await requireModule(businessId, "settings");
  if (!isFormType(formId)) notFound();

  const initial = getFormDefaults(businessId, user.id, formId);
  const label = FORM_LABELS[formId] ?? formId;

  return (
    <SettingsShell
      businessId={businessId}
      title={`${label} Defaults`}
      description={`Configure the default fields and layout that appear when creating a new ${label.toLowerCase()}.`}
      maxWidth="max-w-4xl"
      backHref={`/b/${businessId}/settings/form-defaults`}
      backLabel="Form Defaults"
    >
      <FormDefaultsEditor businessId={businessId} formType={formId} initial={initial} />
    </SettingsShell>
  );
}
