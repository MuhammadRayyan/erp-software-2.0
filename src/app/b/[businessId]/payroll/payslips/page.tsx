import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/core/permissions/require-module";
import { listPayslips, listEmployees } from "@/modules/payroll/services/payroll-service";
import { PayslipsClient } from "./payslips-client";

export const metadata = {
  title: "Payslips - Payroll",
};

export default async function PayslipsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "payroll");

  const payslips = listPayslips(businessId, user.id);
  const employees = listEmployees(businessId, user.id);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Payslips"
        description="Employee wage slips, earnings breakdowns, deductions, and General Ledger posting."
      />
      <PayslipsClient
        businessId={businessId}
        payslips={payslips}
        employees={employees}
        currency={access.business.currency}
      />
    </div>
  );
}
