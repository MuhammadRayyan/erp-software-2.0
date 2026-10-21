import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/core/permissions/require-module";
import { listEmployees, listPayslipItems } from "@/modules/payroll/services/payroll-service";
import { listAccounts } from "@/modules/accounting/services/account-service";
import { PayslipForm } from "../payslip-form";

export const metadata = {
  title: "New Payslip - Payroll",
};

export default async function NewPayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    employeeId?: string;
    gratuityAED?: string;
    leaveEncashmentAED?: string;
    periodDescription?: string;
  }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const { user, access } = await requireModule(businessId, "payroll");

  const employees = listEmployees(businessId, user.id, { isActive: true });
  const items = listPayslipItems(businessId, user.id, { isActive: true });
  const accounts = listAccounts(businessId, user.id);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="New Payslip"
        description="Create an individual employee wage slip with customized earnings and deduction lines."
      />
      <PayslipForm
        businessId={businessId}
        employees={employees}
        items={items}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        currency={access.business.currency}
        prefill={{
          employeeId: sp.employeeId,
          gratuityAED: sp.gratuityAED,
          leaveEncashmentAED: sp.leaveEncashmentAED,
          periodDescription: sp.periodDescription,
        }}
      />
    </div>
  );
}
