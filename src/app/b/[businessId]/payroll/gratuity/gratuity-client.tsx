"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { BookCheck, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate, formatMoney } from "@/core/format";
import { postGratuityAccrualAction, reverseGratuityAccrualAction } from "@/modules/payroll/actions/payroll-actions";
import type { GratuityAccrualPreview, GratuityAccrualRun } from "@/modules/payroll/services/gratuity-accrual-service";

interface GratuityAccrualClientProps {
  businessId: string;
  currency: string;
  preview: GratuityAccrualPreview;
  runs: GratuityAccrualRun[];
  provision: { subledgerMinor: number; glMinor: number };
}

export function GratuityAccrualClient({ businessId, currency, preview, runs, provision }: GratuityAccrualClientProps) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const { ask, dialog } = useConfirmDialog();
  const money = (minor: number) => formatMoney(minor, currency);
  const blockedReason = preview.lockedReason
    ?? (preview.laterPeriod ? `The accrual for ${preview.laterPeriod} is posted. Reverse later months before changing ${preview.period}.` : null);
  const totalLiability = preview.lines.reduce((sum, line) => sum + line.liabilityMinor, 0);
  const totalOpening = preview.lines.reduce((sum, line) => sum + line.openingProvisionMinor, 0);

  function selectMonth(month: string) {
    if (!month) return;
    startNavigation(() => router.push(`/b/${businessId}/payroll/gratuity?month=${month}`));
  }

  function confirmPost() {
    ask({
      title: preview.existing ? `Re-post gratuity accrual for ${preview.period}?` : `Post gratuity accrual for ${preview.period}?`,
      description: preview.existing
        ? `The ${preview.period} accrual is recalculated and its journal replaced in place: ${money(preview.totalAmountMinor)} for ${preview.lines.length} employee(s), dated ${formatDate(preview.accrualDate)}.`
        : `Dr gratuity expense / Cr end-of-service provision ${money(preview.totalAmountMinor)} for ${preview.lines.length} employee(s), dated ${formatDate(preview.accrualDate)}.`,
      confirmLabel: preview.existing ? "Re-post accrual" : "Post accrual",
      tone: "primary",
      onConfirm: async () => {
        const result = await postGratuityAccrualAction(businessId, preview.period);
        if (result.error) throw new Error(result.error);
        toast.success(`Gratuity accrual for ${preview.period} ${result.data?.replaced ? "re-posted" : "posted"}.`);
        router.refresh();
      },
    });
  }

  function confirmReverse() {
    ask({
      title: `Reverse gratuity accrual for ${preview.period}?`,
      description: `A reversing journal dated ${formatDate(preview.accrualDate)} cancels this month's accrual. You can post the month again afterwards.`,
      confirmLabel: "Reverse accrual",
      tone: "danger",
      onConfirm: async () => {
        const result = await reverseGratuityAccrualAction(businessId, preview.period);
        if (result.error) throw new Error(result.error);
        toast.success(`Gratuity accrual for ${preview.period} reversed.`);
        router.refresh();
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Gratuity Accruals"
        description="Month-end end-of-service benefit (EOSB) accrual: each employee's provision is brought to the liability the EOSB calculator gives at month end."
      >
        {preview.existing && (
          <Button permission="delete" variant="secondary" disabled={Boolean(blockedReason)} onClick={confirmReverse}>
            <Undo2 className="size-4" /> Reverse {preview.period}
          </Button>
        )}
        <Button permission="post" disabled={Boolean(blockedReason) || navigating} onClick={confirmPost}>
          <BookCheck className="size-4" /> {preview.existing ? "Re-post gratuity accrual" : "Post gratuity accrual"}
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="gratuity-month">Month</Label>
          <Input key={preview.period} id="gratuity-month" type="month" className="w-44" defaultValue={preview.period} onChange={(event) => selectMonth(event.target.value)} />
        </div>
        <p className="pb-2 text-sm text-muted-foreground">
          Accrual date {formatDate(preview.accrualDate)}
          {preview.existing ? <> · <Badge tone="success">Posted</Badge> {preview.existing.entryNumber ?? ""} ({money(preview.existing.totalAmountMinor)})</> : <> · <Badge>Not posted</Badge></>}
        </p>
      </div>

      {blockedReason && (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm">{blockedReason}</div>
      )}

      {preview.lines.length ? (
        <div className="data-panel overflow-x-auto">
          <table className="data-table min-w-table-xl">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Joined</th>
                <th className="text-right!">Basic salary</th>
                <th className="text-right!">Liability at month end</th>
                <th className="text-right!">Provision booked</th>
                <th className="text-right!">This accrual</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((line) => (
                <tr key={line.employeeId}>
                  <td>
                    <span className="font-medium">{line.employeeName}</span>
                    {line.employeeCode && <span className="ml-1.5 text-xs text-muted-foreground">{line.employeeCode}</span>}
                  </td>
                  <td>{formatDate(line.joiningDate)}</td>
                  <td className="money text-right">{money(line.basicSalaryMinor)}</td>
                  <td className="money text-right">{money(line.liabilityMinor)}</td>
                  <td className="money text-right">{money(line.openingProvisionMinor)}</td>
                  <td className={`money text-right font-medium ${line.amountMinor < 0 ? "text-danger" : ""}`}>{money(line.amountMinor)}</td>
                  <td className="text-xs text-muted-foreground">{line.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong bg-surface font-semibold">
                <td className="h-11 px-3" colSpan={3}>Total</td>
                <td className="money h-11 px-3 text-right">{money(totalLiability)}</td>
                <td className="money h-11 px-3 text-right">{money(totalOpening)}</td>
                <td className="money h-11 px-3 text-right">{money(preview.totalAmountMinor)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface py-10 text-center">
          <p className="font-medium">Nothing to accrue for {preview.period}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Employees need a joining date and basic salary; under the EOSB rules gratuity accrues from one year of service.
          </p>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Final-settlement payslips that pay the End of Service Gratuity item draw down the provision first; only any excess is expensed.
        Deactivate leavers before running their leaving month so any unused provision is released.
      </p>

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Accrual history</h2>
          <p className="text-sm text-muted-foreground">
            Provision: employees {money(provision.subledgerMinor)} · GL {money(provision.glMinor)}
            {provision.subledgerMinor !== provision.glMinor && <Badge tone="danger" className="ml-2">Difference {money(provision.subledgerMinor - provision.glMinor)}</Badge>}
          </p>
        </div>
        {runs.length ? (
          <div className="data-panel overflow-x-auto">
            <table className="data-table min-w-table-md">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Status</th>
                  <th className="text-right!">Employees</th>
                  <th className="text-right!">Amount</th>
                  <th>Journal</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link className="font-medium text-primary hover:underline" href={`/b/${businessId}/payroll/gratuity?month=${run.period}`}>{run.period}</Link>
                    </td>
                    <td><Badge tone={run.status === "posted" ? "success" : "neutral"}>{run.status === "posted" ? "Posted" : "Reversed"}</Badge></td>
                    <td className="text-right tabular-nums">{run.employeeCount}</td>
                    <td className="money text-right">{money(run.totalAmountMinor)}</td>
                    <td>
                      {run.journalEntryId ? (
                        <Link className="text-primary hover:underline" href={`/b/${businessId}/accounting/journal/${run.journalEntryId}`}>{run.entryNumber ?? "View"}</Link>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No gratuity accruals have been posted yet.</p>
        )}
      </section>
      {dialog}
    </>
  );
}
