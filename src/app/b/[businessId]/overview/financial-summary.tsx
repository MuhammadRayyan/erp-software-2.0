import { getTrialBalance } from "@/modules/reports/report-service";
import { formatMoney } from "@/core/format";

export function FinancialSummary({ businessId, userId, currency }: { businessId: string, userId: string, currency: string }) {
  const tb = getTrialBalance(businessId, userId);
  
  const groups: Record<string, typeof tb.accounts> = {
    asset: [],
    liability: [],
    equity: [],
    income: [],
    expense: [],
  };

  for (const acc of tb.accounts) {
    if (groups[acc.type]) {
      groups[acc.type].push(acc);
    }
  }

  const renderGroup = (title: string, type: string, isDebitNormal: boolean) => {
    const accounts = groups[type] || [];
    let total = 0;
    
    const rows = accounts.map(acc => {
      const balance = isDebitNormal ? acc.debitMinor - acc.creditMinor : acc.creditMinor - acc.debitMinor;
      total += balance;
      return { ...acc, balance };
    }).filter(acc => acc.balance !== 0);

    if (rows.length === 0) return null;

    return (
      <div className="mb-6 last:mb-0">
        <h3 className="text-sm font-semibold border-b border-border pb-1.5 mb-2 text-foreground tracking-tight">{title}</h3>
        <div className="space-y-0.5">
          {rows.map(acc => (
            <div key={acc.id} className="flex justify-between text-[13px] py-1.5 hover:bg-surface-muted px-2 -mx-2 rounded transition-colors">
              <span className="text-muted-foreground">{acc.name}</span>
              <span className="font-medium tabular-nums">{formatMoney(acc.balance, currency)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[13px] py-1.5 font-semibold border-t border-border/50 mt-1">
            <span>Total {title}</span>
            <span className="tabular-nums">{formatMoney(total, currency)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 mt-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-semibold text-lg mb-5">Balance Sheet</h2>
        {renderGroup("Assets", "asset", true)}
        {renderGroup("Liabilities", "liability", false)}
        {renderGroup("Equity", "equity", false)}
        {groups["asset"].length === 0 && groups["liability"].length === 0 && groups["equity"].length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No balance sheet activity yet.</p>
        )}
      </section>
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="font-semibold text-lg mb-5">Profit & Loss</h2>
        {renderGroup("Income", "income", false)}
        {renderGroup("Expenses", "expense", true)}
        {groups["income"].length === 0 && groups["expense"].length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No income or expense activity yet.</p>
        )}
      </section>
    </div>
  );
}
