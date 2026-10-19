import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/core/permissions/require-module";
import {
  getPayslipWithLines,
  listEmployees,
  listPayslipItems,
} from "@/modules/payroll/services/payroll-service";
import { listAccounts } from "@/modules/accounting/services/account-service";
import { PayslipForm } from "../../payslip-form";

export const metadata = {
  title: "Edit Payslip - Payroll",
};

export default async function EditPayslipPage({
  params,
}: {
  params: Promise<{ businessId: string; payslipId: string }>;
}) {
  const { businessId, payslipId } = await params;
  const { user } = await requireModule(businessId, "payroll");

  const record = getPayslipWithLines(businessId, user.id, payslipId);
  if (!record) notFound();

  // If already posted, redirect to detail view with notice
  if (record.payslip.documentStatus !== "draft") {
    redirect(`/b/${businessId}/payroll/payslips/${payslipId}`);
  }

  const employees = listEmployees(businessId, user.id);
  const items = listPayslipItems(businessId, user.id);
  const accounts = listAccounts(businessId, user.id);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title={`Edit Payslip: ${record.payslip.payslipNumber}`}
        description={`Modify draft payslip for ${record.employee.name}.`}
      />
      <PayslipForm
        businessId={businessId}
        employees={employees}
        items={items}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        initialPayslip={record.payslip}
        initialLines={record.lines}
      />
    </div>
  );
}
