import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/core/permissions/require-module";
import { listPayslipItems } from "@/modules/payroll/services/payroll-service";
import { listAccounts } from "@/modules/accounting/services/account-service";
import { ItemsClient } from "./items-client";

export const metadata = {
  title: "Payslip Items - Payroll",
};

export default async function PayslipItemsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "payroll");

  const items = listPayslipItems(businessId, user.id);
  const accounts = listAccounts(businessId, user.id);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Payslip Items"
        description="Predefined earnings and deduction line items mapped to General Ledger accounts."
      />
      <ItemsClient
        businessId={businessId}
        items={items}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
        }))}
      />
    </div>
  );
}
