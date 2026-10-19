import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/core/permissions/require-module";
import { listEmployees } from "@/modules/payroll/services/payroll-service";
import { EosbClient } from "./eosb-client";

export const metadata = {
  title: "UAE End of Service (EOSB) Calculator - Payroll",
};

export default async function EosbCalculatorPage({
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
        title="UAE End of Service (EOSB) Calculator"
        description="On-demand severance calculator compliant with UAE Federal Decree-Law No. 33 of 2021 (Article 51 Gratuity & Article 29 Leave Encashment)."
      />
      <EosbClient businessId={businessId} employees={employees} />
    </div>
  );
}
