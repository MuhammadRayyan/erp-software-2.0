import { requireModule } from "@/core/permissions/require-module";
import { SettingsShell } from "@/components/settings-shell";
import { listPaymentTerms } from "@/modules/payment-terms/payment-terms-service";
import { PaymentTermsManager } from "@/modules/payment-terms/components/payment-terms-manager";

export const metadata = {
  title: "Payment Terms",
};

export default async function PaymentTermsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  await requireModule(businessId, "settings");
  const terms = listPaymentTerms(businessId);

  return (
    <SettingsShell
      businessId={businessId}
      title="Payment Terms"
      description="Configure default credit and settlement terms (e.g. Net 30, End of Month, Due on Receipt) for customers and suppliers."
    >
      <PaymentTermsManager businessId={businessId} terms={terms} />
    </SettingsShell>
  );
}

