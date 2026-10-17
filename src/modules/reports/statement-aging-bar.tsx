import { formatMoney, formatDate } from "@/core/format";
import type { AgingBuckets } from "./customer-statement-service";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";

export function StatementAgingBar({
  aging,
  partyType = "customer",
  className,
}: {
  aging: AgingBuckets;
  partyType?: "customer" | "supplier";
  className?: string;
}) {
  const currency = aging.currencyCode;
  const isCustomer = partyType === "customer";

  const buckets = [
    {
      label: "Current (Not Due)",
      amountMinor: aging.currentMinor,
      tone: "neutral",
    },
    {
      label: "1 – 30 Days",
      amountMinor: aging.days30Minor,
      tone: aging.days30Minor > 0 ? "warning" : "neutral",
    },
    {
      label: "31 – 60 Days",
      amountMinor: aging.days60Minor,
      tone: aging.days60Minor > 0 ? "warning" : "neutral",
    },
    {
      label: "61 – 90 Days",
      amountMinor: aging.days90Minor,
      tone: aging.days90Minor > 0 ? "danger" : "neutral",
    },
    {
      label: "90+ Days",
      amountMinor: aging.days90PlusMinor,
      tone: aging.days90PlusMinor > 0 ? "danger" : "neutral",
    },
  ];

  return (
    <div className={cn("rounded-lg border border-border bg-surface p-4 shadow-xs", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          <Clock className="size-3.5 text-primary" aria-hidden />
          <span>Aging Analysis ({isCustomer ? "Receivables" : "Payables"})</span>
        </div>
        <span className="text-xs text-muted-foreground">
          As of <span className="font-medium text-foreground">{formatDate(aging.asOfDate)}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="flex flex-col rounded-md border border-border/60 bg-surface-muted/30 p-2.5 transition-colors"
          >
            <span className="text-[11px] font-medium text-muted-foreground">{b.label}</span>
            <span
              className={cn(
                "mt-1 text-sm font-semibold tabular-nums",
                b.tone === "danger" && "text-destructive font-bold",
                b.tone === "warning" && "text-amber-600 dark:text-amber-400 font-semibold",
                b.tone === "neutral" && "text-foreground",
              )}
            >
              {formatMoney(b.amountMinor, currency)}
            </span>
          </div>
        ))}

        <div className="flex flex-col rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <span className="text-[11px] font-medium text-primary">
            {isCustomer ? "Total Outstanding" : "Total Payable"}
          </span>
          <span className="mt-1 text-sm font-bold tabular-nums text-primary">
            {formatMoney(aging.totalMinor, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}
