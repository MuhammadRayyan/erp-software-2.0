import { requireModule } from "@/core/permissions/require-module";
import { BackLink } from "@/components/back-link";
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
    <div className="page-container max-w-4xl space-y-6">
      <BackLink href={`/b/${businessId}/settings`}>Settings</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payment Terms</h1>
          <p className="page-description">
            Configure default credit and settlement terms (e.g. Net 30, End of Month, Due on Receipt) for customers and suppliers.
          </p>
        </div>
      </div>
      <PaymentTermsManager businessId={businessId} terms={terms} />
    </div>
  );
}
