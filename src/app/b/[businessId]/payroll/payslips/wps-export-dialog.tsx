"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  DialogRoot,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/core/format";
import type { WpsSifResult } from "@/modules/payroll/services/wps-service";

interface WpsExportDialogProps {
  businessId: string;
  currency?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WpsExportDialog({
  businessId,
  currency = "AED",
  open,
  onOpenChange,
}: WpsExportDialogProps) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<WpsSifResult | null>(null);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setFetchError("");

    const params = new URLSearchParams({ preview: "1", month });
    if (reference.trim()) params.set("reference", reference.trim());

    fetch(`/api/businesses/${businessId}/payroll/wps?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to validate WPS data.");
        if (active) setPreview(data as WpsSifResult);
      })
      .catch((err) => {
        if (active) setFetchError(err instanceof Error ? err.message : "Validation failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, businessId, month, reference]);

  const downloadHref = (() => {
    const params = new URLSearchParams({ month });
    if (reference.trim()) params.set("reference", reference.trim());
    return `/api/businesses/${businessId}/payroll/wps?${params.toString()}`;
  })();

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 text-primary" />
          Export UAE WPS (.SIF) Salary File
        </DialogTitle>
        <DialogDescription>
          Generates a CBUAE / MOHRE Wage Protection System Salary Information File (.SIF) from posted payslips.
        </DialogDescription>

        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wps-month">Salary Month</Label>
              <Input
                id="wps-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wps-ref">Employer Batch Reference (optional)</Label>
              <Input
                id="wps-ref"
                placeholder={`PAY-${month}`}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking MOHRE & employee bank details for {month}…
            </div>
          )}

          {fetchError && (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {fetchError}
            </div>
          )}

          {!loading && preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-xs text-muted-foreground">Employees (EDR)</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{preview.summary.edrCount}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-xs text-muted-foreground">Total Salary</p>
                  <p className="money mt-1 text-lg font-semibold">
                    {formatMoney(preview.summary.totalSalaryMinor, currency)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-raised p-3">
                  <p className="text-xs text-muted-foreground">WPS Readiness</p>
                  <div className="mt-1">
                    <Badge tone={preview.valid ? "success" : "danger"}>
                      {preview.valid ? "Ready to Export" : `${preview.errors.length} Blocking Issue(s)`}
                    </Badge>
                  </div>
                </div>
              </div>

              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-danger flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" /> Fix before bank submission:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-danger space-y-1">
                    {preview.errors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-warning-foreground">Warnings</p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.valid && preview.rows.length > 0 && (
                <div className="rounded-md border border-success/30 bg-success/10 p-3 text-xs text-foreground flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-success shrink-0" />
                  <span>
                    All {preview.rows.length} posted payslip(s) validated against MOHRE Establishment{" "}
                    <span className="font-mono font-semibold">{preview.summary.employerMolId}</span>. File:{" "}
                    <span className="font-mono">{preview.filename}</span>
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {preview?.valid ? (
              <Button permission="export" asChild>
                <a href={downloadHref} download={preview.filename}>
                  <Download className="size-4" /> Download .SIF File
                </a>
              </Button>
            ) : (
              <Button permission="export" disabled>
                <Download className="size-4" /> Download .SIF File
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
