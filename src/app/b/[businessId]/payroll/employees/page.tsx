import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/core/permissions/require-module";
import { listEmployees } from "@/modules/payroll/services/payroll-service";
import { EmployeesClient } from "./employees-client";

export const metadata = {
  title: "Employees - Payroll",
};

export default async function EmployeesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const { user } = await requireModule(businessId, "payroll");

  const employees = listEmployees(businessId, user.id);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Employees"
        description="Master directory of workforce, job designations, and standard compensation structures."
      />
      <EmployeesClient businessId={businessId} employees={employees} />
    </div>
  );
}
