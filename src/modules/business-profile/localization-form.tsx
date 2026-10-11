"use client";

import { useState } from "react";
import { Calendar, Clock, DollarSign, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { updateLocalizationAction } from "./actions";
import type { LocalizationInput } from "./business-profile-input";
import type { ResolvedBusinessProfile } from "./business-profile-service";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DATE_FORMAT_OPTIONS = [
  { id: "DD/MM/YYYY", label: "DD/MM/YYYY", example: "31/12/2026", description: "Standard UAE & International" },
  { id: "YYYY-MM-DD", label: "YYYY-MM-DD", example: "2026-12-31", description: "ISO 8601 Standard" },
  { id: "MM/DD/YYYY", label: "MM/DD/YYYY", example: "12/31/2026", description: "US Standard" },
  { id: "DD MMM YYYY", label: "DD MMM YYYY", example: "31 Dec 2026", description: "Long format with month name" },
] as const;

export function LocalizationForm({
  businessId,
  initial,
  isAdmin,
}: {
  businessId: string;
  initial: ResolvedBusinessProfile;
  isAdmin: boolean;
}) {
  const [values, setValues] = useState<LocalizationInput>({
    dateFormat: initial.dateFormat,
    timeFormat: initial.timeFormat,
    financialYearStartMonth: initial.financialYearStartMonth,
  });

  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;

    setPending(true);
    setServerError("");

    const res = await updateLocalizationAction(businessId, values);
    setPending(false);

    if (res.error) {
      setServerError(res.error);
      toast.error(res.error);
    } else {
      toast.success("Regional and localization settings updated.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      {/* Date Format Selection */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Calendar className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Date Format</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Choose the preferred date display format for tables, printouts, and reports across this business.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                values.dateFormat === opt.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <input
                type="radio"
                name="dateFormat"
                value={opt.id}
                checked={values.dateFormat === opt.id}
                onChange={() => setValues({ ...values, dateFormat: opt.id })}
                disabled={!isAdmin}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">{opt.label}</span>
                  <span className="font-mono text-xs rounded bg-surface-muted px-1.5 py-0.5 text-muted-foreground">
                    {opt.example}
                  </span>
                </div>
                <span className="block text-xs text-muted-foreground">{opt.description}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Time Format */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Clock className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Time Format</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: "12h" as const, label: "12-Hour Clock", example: "02:30 PM", desc: "Standard am/pm time" },
            { id: "24h" as const, label: "24-Hour Clock", example: "14:30", desc: "Military / ISO 24h time" },
          ].map((t) => (
            <label
              key={t.id}
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                values.timeFormat === t.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-surface hover:bg-surface-muted"
              }`}
            >
              <input
                type="radio"
                name="timeFormat"
                value={t.id}
                checked={values.timeFormat === t.id}
                onChange={() => setValues({ ...values, timeFormat: t.id })}
                disabled={!isAdmin}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">{t.label}</span>
                  <span className="font-mono text-xs rounded bg-surface-muted px-1.5 py-0.5 text-muted-foreground">
                    {t.example}
                  </span>
                </div>
                <span className="block text-xs text-muted-foreground">{t.desc}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Financial Year Start Month */}
      <section className="rounded-lg border border-border bg-surface-raised p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <DollarSign className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Financial & Fiscal Year</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fiscalStart">Fiscal Year Start Month</Label>
            <select
              id="fiscalStart"
              value={values.financialYearStartMonth}
              onChange={(e) => setValues({ ...values, financialYearStartMonth: Number(e.target.value) })}
              disabled={!isAdmin}
              className="w-full h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name} (Month {idx + 1})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used for financial statements, period comparison, and annual Profit & Loss calculations.
            </p>
          </div>

          <div className="rounded-md border border-border bg-surface-muted/50 p-4 space-y-1">
            <span className="text-xs font-semibold text-foreground">Base Currency Notice</span>
            <p className="text-xs text-muted-foreground">
              The base accounting currency is <strong>{initial.baseCurrency}</strong>. Base currency changes are handled under Currencies & Exchange Rates.
            </p>
          </div>
        </div>
      </section>

      {serverError && <FormError message={serverError} />}

      {isAdmin && (
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircle className="size-4 animate-spin mr-1.5" />}
            Save Localization Settings
          </Button>
        </div>
      )}
    </form>
  );
}
