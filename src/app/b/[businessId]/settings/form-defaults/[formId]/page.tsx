import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { requireUser } from "@/core/auth/session";
import { getBusinessForUser } from "@/core/businesses/business-service";
import { getFormDefaults, isFormType } from "@/modules/form-defaults/form-defaults-service";
import { FormDefaultsEditor } from "@/modules/form-defaults/form-defaults-editor";

const FORM_LABELS: Record<string, string> = {
  "sales-quote": "Sales Quote",
  "sales-order": "Sales Order",
  "sales-invoice": "Sales Invoice",
  "sales-credit-note": "Sales Credit Note",
  "purchase-quote": "Purchase Quote",
  "purchase-order": "Purchase Order",
  "purchase-invoice": "Purchase Invoice",
  "debit-note": "Debit Note",
};

export default async function FormDefaultsDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; formId: string }>;
}) {
  const { businessId, formId } = await params;
  const user = await requireUser();
  const access = getBusinessForUser(businessId, user.id);
  if (!access) notFound();
  if (!isFormType(formId)) notFound();

  const initial = getFormDefaults(businessId, user.id, formId);
  const label = FORM_LABELS[formId] ?? formId;

  return (
    <div className="page-container max-w-3xl">
      <div className="mb-5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link href={`/b/${businessId}/settings`} className="hover:text-foreground">Settings</Link>
        <ChevronRight className="size-4" />
        <Link href={`/b/${businessId}/settings/form-defaults`} className="hover:text-foreground">Form Defaults</Link>
        <ChevronRight className="size-4" />
        <span className="text-foreground">{label}</span>
      </div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{label} defaults</h1>
          <p className="page-description">Configure the default fields and layout that appear when creating a new {label.toLowerCase()}.</p>
        </div>
      </div>
      <FormDefaultsEditor businessId={businessId} formType={formId} initial={initial} />
    </div>
  );
}
