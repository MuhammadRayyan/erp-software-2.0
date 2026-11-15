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
  const { user, access } = await requireModule(businessId, "payroll");

  const employees = listEmployees(businessId, user.id);

  return (
    <div className="page-container">
      <EmployeesClient
        businessId={businessId}
        employees={employees}
        currency={access.business.currency}
      />
    </div>
  );
}
