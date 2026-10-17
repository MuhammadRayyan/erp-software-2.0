"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Mail, Send, XCircle } from "lucide-react";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/core/format";
import { batchSendDocumentEmailsAction, type BatchEmailResult } from "@/modules/email/actions";
import { toast } from "sonner";

export interface BatchEmailInvoiceItem {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string | null;
  totalMinor: number;
  currencyCode: string;
}

export function BatchEmailModal({
  open,
  onOpenChange,
  businessId,
  invoices,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  invoices: BatchEmailInvoiceItem[];
  onSuccess?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [customNote, setCustomNote] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [lastResult, setLastResult] = useState<BatchEmailResult | null>(null);

  const eligibleInvoices = invoices.filter((i) => Boolean(i.customerEmail?.trim()));
  const missingEmailCount = invoices.length - eligibleInvoices.length;

  const handleSendBatch = () => {
    if (!eligibleInvoices.length) {
      toast.error("None of the selected invoices have customer email addresses.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await batchSendDocumentEmailsAction(
          businessId,
          "sales-invoice",
          eligibleInvoices.map((i) => i.id),
          {
            customNote: customNote.trim() || undefined,
            attachPdf,
          }
        );
        setLastResult(result);
        if (result.sentCount > 0) {
          toast.success(`Successfully sent ${result.sentCount} invoice ${result.sentCount === 1 ? "email" : "emails"}.`);
          onSuccess?.();
        } else {
          toast.error("Failed to send any batch emails.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to execute batch email.");
      }
    });
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="flex items-center gap-2">
          <Mail className="size-5 text-primary" />
          Batch Email Invoices ({invoices.length})
        </DialogTitle>
        <DialogDescription>
          Send invoices to each customer&apos;s registered email address with optional PDF attachments.
        </DialogDescription>

        <div className="mt-4 space-y-4">
          {missingEmailCount > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <span>
                <strong>{missingEmailCount} of {invoices.length} invoices</strong> cannot be sent because their customers have no email address configured.
              </span>
            </div>
          )}

          <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-raised divide-y divide-border">
            {invoices.map((inv) => {
              const hasEmail = Boolean(inv.customerEmail?.trim());
              return (
                <div key={inv.id} className="flex items-center justify-between p-2.5 text-xs">
                  <div className="flex flex-col">
                    <span className="font-semibold">{inv.invoiceNumber} · {inv.customerName}</span>
                    <span className={hasEmail ? "text-muted-foreground" : "text-danger font-medium"}>
                      {hasEmail ? inv.customerEmail : "Missing email address"}
                    </span>
                  </div>
                  <span className="money font-medium">
                    {formatMoney(inv.totalMinor, inv.currencyCode)}
                  </span>
                </div>
              );
            })}
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Custom Message / Note to Customers (Optional)
            </label>
            <Textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Please find attached your latest statement and invoice. Kindly remit payment at your earliest convenience."
              rows={3}
              className="text-xs"
              disabled={isPending}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="batch-attach-pdf"
              checked={attachPdf}
              onChange={(e) => setAttachPdf(e.target.checked)}
              className="size-4 rounded accent-primary cursor-pointer"
              disabled={isPending}
            />
            <label htmlFor="batch-attach-pdf" className="text-xs font-medium cursor-pointer">
              Attach generated official PDF to each email
            </label>
          </div>

          {lastResult && (
            <div className="rounded-lg border border-border p-3 text-xs space-y-1 bg-surface">
              <p className="font-semibold">Execution Summary:</p>
              <p className="text-success flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5" /> {lastResult.sentCount} sent successfully
              </p>
              {lastResult.skippedCount > 0 && (
                <p className="text-amber-600 flex items-center gap-1.5">
                  <AlertCircle className="size-3.5" /> {lastResult.skippedCount} skipped (missing email)
                </p>
              )}
              {lastResult.failedCount > 0 && (
                <p className="text-danger flex items-center gap-1.5">
                  <XCircle className="size-3.5" /> {lastResult.failedCount} failed
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {lastResult ? "Close" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={handleSendBatch}
              disabled={isPending || eligibleInvoices.length === 0}
              className="gap-1.5"
            >
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Sending {eligibleInvoices.length} Emails...
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Send {eligibleInvoices.length} {eligibleInvoices.length === 1 ? "Email" : "Emails"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
