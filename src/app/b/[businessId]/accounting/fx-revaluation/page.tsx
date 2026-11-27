import { BackLink } from "@/components/back-link";
import { getBusinessTodayIso } from "@/core/format";
import { requireModule } from "@/core/permissions/require-module";
import {
  getFxRevaluationLines,
  getFxRevaluationRateDefaults,
  listFxRevaluations,
} from "@/modules/accounting/services/fx-revaluation-service";
import { FxRevaluationWorkspace, type FxRunSummary } from "@/modules/accounting/fx-revaluation-workspace";

export const metadata = {
  title: "FX Revaluation",
};

function parseRates(json: string): Record<string, string> {
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? value as Record<string, string> : {};
  } catch {
    return {};
  }
}

export default async function FxRevaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string; run?: string }>;
}) {
  const { businessId } = await params;
  const search = await searchParams;
  const { user, access } = await requireModule(businessId, "accounting");
  const date = search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) ? search.date : getBusinessTodayIso();
  const runs: FxRunSummary[] = listFxRevaluations(businessId, user.id).map((run) => ({
    id: run.id,
    revaluation_number: run.revaluation_number,
    date: run.date,
    reversal_date: run.reversal_date,
    net_adjustment_minor: run.net_adjustment_minor,
    status: run.status,
    line_count: run.line_count,
    rates: parseRates(run.rates_json),
    journal_entry_id: run.journal_entry_id,
    reversal_journal_entry_id: run.reversal_journal_entry_id,
  }));
  const selectedRun = runs.find((run) => run.id === search.run) ?? null;

  return (
    <div className="page-container space-y-6">
      <BackLink href={`/b/${businessId}/accounting/journal`}>Journal Entries</BackLink>
      <div className="page-header">
        <div>
          <h1 className="page-title">FX Revaluation</h1>
          <p className="page-description">
            Revalue open foreign-currency receivables, payables and bank balances at closing rates and post the unrealized gain or loss.
          </p>
        </div>
      </div>
      <FxRevaluationWorkspace
        key={date}
        businessId={businessId}
        baseCurrency={access.business.currency}
        date={date}
        rateDefaults={getFxRevaluationRateDefaults(businessId, user.id, date)}
        runs={runs}
        selectedRun={selectedRun}
        selectedRunLines={selectedRun ? getFxRevaluationLines(businessId, user.id, selectedRun.id) : []}
      />
    </div>
  );
}
