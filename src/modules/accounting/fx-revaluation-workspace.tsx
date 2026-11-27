"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, LoaderCircle, Ban, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { formatDate, formatMoney } from "@/core/format";
import { postFxRevaluationAction, previewFxRevaluationAction, voidFxRevaluationAction } from "./fx-revaluation-actions";
import type { FxRevaluationKind, FxRevaluationPreview } from "./services/fx-revaluation-service";

export type FxRateDefault = {
  code: string; name: string; minorUnit: number; rateToBase: string; rateDate: string | null; source: string | null;
};

export type FxRunSummary = {
  id: string; revaluation_number: string; date: string; reversal_date: string; net_adjustment_minor: number;
  status: "posted" | "void"; line_count: number; rates: Record<string, string>;
  journal_entry_id: string | null; reversal_journal_entry_id: string | null;
};

export type FxRunLine = {
  id: string; kind: FxRevaluationKind; source_number: string; party_name: string | null; account_name: string;
  currency_code: string; currency_minor_unit: number | null; foreign_open_minor: number; carrying_base_minor: number;
  rate_to_base: string; revalued_base_minor: number; adjustment_minor: number;
};

const KIND_LABELS: Record<FxRevaluationKind, string> = {
  receivable: "Receivable",
  customer_credit: "Customer advance",
  payable: "Payable",
  supplier_credit: "Supplier advance",
  bank: "Bank balance",
};

function SignedMoney({ minor, currency }: { minor: number; currency: string }) {
  if (minor === 0) return <span className="text-muted-foreground">—</span>;
  return <span className={minor > 0 ? "text-success" : "text-danger"}>{minor > 0 ? "+" : "−"}{formatMoney(Math.abs(minor), currency)}</span>;
}

export function FxRevaluationLinesTable({ lines, baseCurrency }: {
  lines: Array<{
    key: string; kind: FxRevaluationKind; sourceNumber: string; partyName: string | null; accountName: string;
    currencyCode: string; currencyMinorUnit: number; foreignOpenMinor: number; carryingBaseMinor: number;
    rateToBase: string; revaluedBaseMinor: number; adjustmentMinor: number;
  }>;
  baseCurrency: string;
}) {
  if (lines.length === 0) {
    return <div className="rounded-md border border-border bg-surface px-4 py-5 text-sm text-muted-foreground">No open foreign-currency balances on this date.</div>;
  }
  return <div className="data-panel"><table className="data-table min-w-table-xl"><thead><tr>
    <th>Type</th><th>Document / Account</th><th>Party</th><th>GL Account</th>
    <th className="text-right!">Open (foreign)</th><th className="text-right!">Carrying ({baseCurrency})</th>
    <th className="text-right!">Rate</th><th className="text-right!">Revalued ({baseCurrency})</th><th className="text-right!">Gain / (Loss)</th>
  </tr></thead><tbody>{lines.map((line) => <tr key={line.key}>
    <td>{KIND_LABELS[line.kind]}</td>
    <td className="tabular">{line.sourceNumber}</td>
    <td>{line.partyName ?? "—"}</td>
    <td>{line.accountName}</td>
    <td className="money text-right">{formatMoney(line.foreignOpenMinor, line.currencyCode, line.currencyMinorUnit)}</td>
    <td className="money text-right">{formatMoney(line.carryingBaseMinor, baseCurrency)}</td>
    <td className="tabular text-right">{line.rateToBase}</td>
    <td className="money text-right">{formatMoney(line.revaluedBaseMinor, baseCurrency)}</td>
    <td className="money text-right font-medium"><SignedMoney minor={line.adjustmentMinor} currency={baseCurrency} /></td>
  </tr>)}</tbody></table></div>;
}

export function FxRevaluationWorkspace({ businessId, baseCurrency, date, rateDefaults, runs, selectedRun, selectedRunLines }: {
  businessId: string;
  baseCurrency: string;
  date: string;
  rateDefaults: FxRateDefault[];
  runs: FxRunSummary[];
  selectedRun: FxRunSummary | null;
  selectedRunLines: FxRunLine[];
}) {
  const router = useRouter();
  const [revaluationDate, setRevaluationDate] = useState(date);
  const [rates, setRates] = useState<Record<string, string>>(
    () => Object.fromEntries(rateDefaults.map((rate) => [rate.code, rate.rateToBase])),
  );
  const [preview, setPreview] = useState<FxRevaluationPreview | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmPost, setConfirmPost] = useState(false);
  const [voidTarget, setVoidTarget] = useState<FxRunSummary | null>(null);
  const [voidError, setVoidError] = useState("");

  const previewLines = useMemo(() => (preview?.lines ?? []).map((line) => ({ ...line, key: `${line.kind}:${line.sourceId}` })), [preview]);
  const adjusted = previewLines.filter((line) => line.adjustmentMinor !== 0).length;

  function changeDate(next: string) {
    setRevaluationDate(next);
    setPreview(null);
    if (/^\d{4}-\d{2}-\d{2}$/.test(next)) router.push(`/b/${businessId}/accounting/fx-revaluation?date=${next}`);
  }

  function runPreview() {
    setError("");
    startTransition(async () => {
      const result = await previewFxRevaluationAction(businessId, { date: revaluationDate, rates });
      if (result.error) { setError(result.error); setPreview(null); return; }
      setPreview(result.preview ?? null);
    });
  }

  function post() {
    setError("");
    startTransition(async () => {
      const result = await postFxRevaluationAction(businessId, { date: revaluationDate, rates });
      setConfirmPost(false);
      if (result.error) { setError(result.error); return; }
      toast.success(`Posted ${result.revaluationNumber}; it reverses automatically on the next day.`);
      setPreview(null);
      router.push(`/b/${businessId}/accounting/fx-revaluation?date=${revaluationDate}&run=${result.id}`);
      router.refresh();
    });
  }

  function voidRun() {
    if (!voidTarget) return;
    setVoidError("");
    startTransition(async () => {
      const result = await voidFxRevaluationAction(businessId, voidTarget.id);
      if (result.error) { setVoidError(result.error); return; }
      toast.success(`Voided ${voidTarget.revaluation_number}.`);
      setVoidTarget(null);
      router.refresh();
    });
  }

  return <div className="space-y-8">
    <section className="rounded-lg border border-border bg-surface-raised p-5">
      <h2 className="text-base font-semibold">New revaluation</h2>
      <p className="mt-1 text-sm text-muted-foreground">Restates open foreign-currency invoices, bills, advances and bank balances at closing rates. One journal posts to Unrealized FX Gain/Loss on the date and reverses on the next day, so realized FX on later settlement is unaffected.</p>
      {error && <div className="mt-4"><FormError message={error} /></div>}
      <div className="mt-5 grid gap-6 lg:grid-cols-[14rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="fx-revaluation-date">Revaluation date</Label>
          <Input id="fx-revaluation-date" type="date" value={revaluationDate} onChange={(event) => changeDate(event.target.value)} />
          <p className="text-xs text-muted-foreground">Usually a period end. Reversal posts on the next day.</p>
        </div>
        <div>
          <p className="text-sm font-medium">Closing rates ({baseCurrency} per unit)</p>
          {rateDefaults.length === 0
            ? <p className="mt-2 text-sm text-muted-foreground">No open foreign-currency balances on this date.</p>
            : <div className="mt-2 data-panel"><table className="data-table min-w-table-md"><thead><tr><th>Currency</th><th>Latest stored rate</th><th className="text-right!">Closing rate</th></tr></thead><tbody>
              {rateDefaults.map((rate) => <tr key={rate.code}>
                <td><span className="font-medium">{rate.code}</span> <span className="text-muted-foreground">{rate.name}</span></td>
                <td className="text-sm text-muted-foreground">{rate.rateDate ? `${rate.rateToBase} · ${rate.source} · ${formatDate(rate.rateDate)}` : "No stored rate"}</td>
                <td className="text-right"><Input aria-label={`${rate.code} closing rate`} inputMode="decimal" className="ml-auto w-36 text-right tabular" value={rates[rate.code] ?? ""}
                  onChange={(event) => { setRates((current) => ({ ...current, [rate.code]: event.target.value })); setPreview(null); }} /></td>
              </tr>)}
            </tbody></table></div>}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={runPreview} disabled={pending || rateDefaults.length === 0}>{pending && !confirmPost ? <LoaderCircle className="size-4 animate-spin" /> : <Eye className="size-4" />} Preview</Button>
        <Button type="button" permission="post" onClick={() => setConfirmPost(true)} disabled={pending || !preview || adjusted === 0 || preview.missingRates.length > 0}><Send className="size-4" /> Post revaluation</Button>
      </div>
    </section>

    {preview && <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-base font-semibold">Preview at {formatDate(preview.date)}</h2><p className="mt-1 text-sm text-muted-foreground">Reverses on {formatDate(preview.reversalDate)}. Net posts to {preview.unrealizedAccountName}.</p></div>
        <p className="text-sm">Net unrealized {preview.netAdjustmentMinor >= 0 ? "gain" : "loss"}: <span className="money font-semibold"><SignedMoney minor={preview.netAdjustmentMinor} currency={baseCurrency} /></span></p>
      </div>
      {preview.missingRates.length > 0 && <FormError message={`Enter a closing rate for ${preview.missingRates.join(", ")}.`} />}
      {preview.accounts.length > 0 && <div className="data-panel"><table className="data-table min-w-table-md"><thead><tr><th>GL Account</th><th className="text-right!">Adjustment (Dr / (Cr))</th></tr></thead><tbody>
        {preview.accounts.map((account) => <tr key={account.accountId}><td>{account.accountName}</td><td className="money text-right"><SignedMoney minor={account.adjustmentMinor} currency={baseCurrency} /></td></tr>)}
        <tr><td>{preview.unrealizedAccountName}</td><td className="money text-right"><SignedMoney minor={-preview.netAdjustmentMinor} currency={baseCurrency} /></td></tr>
      </tbody></table></div>}
      <FxRevaluationLinesTable lines={previewLines} baseCurrency={baseCurrency} />
    </section>}

    <section className="space-y-3">
      <h2 className="text-base font-semibold">History</h2>
      {runs.length === 0
        ? <div className="rounded-md border border-border bg-surface px-4 py-5 text-sm text-muted-foreground">No revaluations yet.</div>
        : <div className="data-panel"><table className="data-table min-w-table-xl"><thead><tr><th>Number</th><th>Date</th><th>Reverses</th><th>Rates</th><th className="text-right!">Lines</th><th className="text-right!">Net gain / (loss)</th><th>Status</th><th>Journals</th><th /></tr></thead><tbody>
          {runs.map((run) => <tr key={run.id} className={selectedRun?.id === run.id ? "bg-surface-muted" : undefined}>
            <td><Link href={`/b/${businessId}/accounting/fx-revaluation?date=${revaluationDate}&run=${run.id}`} className="tabular font-medium text-primary hover:underline">{run.revaluation_number}</Link></td>
            <td>{formatDate(run.date)}</td>
            <td>{formatDate(run.reversal_date)}</td>
            <td className="tabular text-sm text-muted-foreground">{Object.entries(run.rates).map(([code, rate]) => `${code} ${rate}`).join(" · ")}</td>
            <td className="tabular text-right">{run.line_count}</td>
            <td className="money text-right"><SignedMoney minor={run.net_adjustment_minor} currency={baseCurrency} /></td>
            <td><Badge tone={run.status === "posted" ? "info" : "danger"}>{run.status === "posted" ? "Posted" : "Void"}</Badge></td>
            <td className="text-sm">{run.journal_entry_id && <Link href={`/b/${businessId}/accounting/journal/${run.journal_entry_id}`} className="text-primary hover:underline">Entry</Link>}{run.reversal_journal_entry_id && <> · <Link href={`/b/${businessId}/accounting/journal/${run.reversal_journal_entry_id}`} className="text-primary hover:underline">Reversal</Link></>}</td>
            <td className="text-right">{run.status === "posted" && <Button type="button" size="sm" variant="ghost" permission="delete" onClick={() => { setVoidError(""); setVoidTarget(run); }}><Ban className="size-4" /> Void</Button>}</td>
          </tr>)}
        </tbody></table></div>}
    </section>

    {selectedRun && <section className="space-y-3">
      <h2 className="text-base font-semibold">{selectedRun.revaluation_number} detail</h2>
      <FxRevaluationLinesTable baseCurrency={baseCurrency} lines={selectedRunLines.map((line) => ({
        key: line.id, kind: line.kind, sourceNumber: line.source_number, partyName: line.party_name, accountName: line.account_name,
        currencyCode: line.currency_code, currencyMinorUnit: line.currency_minor_unit ?? 2, foreignOpenMinor: line.foreign_open_minor,
        carryingBaseMinor: line.carrying_base_minor, rateToBase: line.rate_to_base, revaluedBaseMinor: line.revalued_base_minor,
        adjustmentMinor: line.adjustment_minor,
      }))} />
    </section>}

    <ConfirmDialog open={confirmPost} onOpenChange={setConfirmPost} tone="primary" pending={pending}
      title="Post FX revaluation?"
      description={preview ? `Posts ${adjusted} adjustment${adjusted === 1 ? "" : "s"} on ${formatDate(preview.date)} with a net unrealized ${preview.netAdjustmentMinor >= 0 ? "gain" : "loss"} of ${formatMoney(Math.abs(preview.netAdjustmentMinor), baseCurrency)}, and the reversal on ${formatDate(preview.reversalDate)}.` : undefined}
      confirmLabel="Post revaluation" onConfirm={post} />
    <ConfirmDialog open={Boolean(voidTarget)} onOpenChange={(open) => { if (!open) setVoidTarget(null); }} pending={pending} error={voidError}
      title={`Void ${voidTarget?.revaluation_number ?? "revaluation"}?`}
      description={voidTarget ? `Cancels the revaluation on ${formatDate(voidTarget.date)} and its reversal on ${formatDate(voidTarget.reversal_date)}. Both dates must be open.` : undefined}
      confirmLabel="Void revaluation" onConfirm={voidRun} />
  </div>;
}
