import { requireModule } from "@/core/permissions/require-module";
import { getBusinessTodayIso } from "@/core/format";
import {
  getGratuityProvisionBalances,
  listGratuityAccruals,
  previewGratuityAccrual,
} from "@/modules/payroll/services/gratuity-accrual-service";
import { GratuityAccrualClient } from "./gratuity-client";

export const metadata = {
  title: "Gratuity Accruals - Payroll",
};

/** The last completed month: the accrual is normally run after month end. */
function previousMonth(todayIso: string) {
  const [year, month] = todayIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function GratuityAccrualPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "payroll");
  const period = query.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month) ? query.month : previousMonth(getBusinessTodayIso());
  const preview = previewGratuityAccrual(businessId, user.id, period);
  const runs = listGratuityAccruals(businessId, user.id);
  const provision = getGratuityProvisionBalances(businessId, user.id);

  return (
    <div className="page-container">
      <GratuityAccrualClient
        businessId={businessId}
        currency={access.business.currency}
        preview={preview}
        runs={runs}
        provision={{ subledgerMinor: provision.subledgerMinor, glMinor: provision.glMinor }}
      />
    </div>
  );
}
