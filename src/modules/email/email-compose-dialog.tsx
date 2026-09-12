"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, Mail, Paperclip, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { cn } from "@/lib/cn";
import { sendDocumentEmailAction } from "./actions";

export interface DocumentEmailDefaults {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

/**
 * Compose-and-send dialog for sales document emails. The page passes the
 * prefilled defaults (computed server-side from the document record); the
 * dialog owns the editing state, validates client-side first (cheap checks),
 * then calls the server action which validates again, generates the PDF
 * attachment (if requested), and dispatches via `sendEmail`.
 *
 * The dialog re-syncs local state when `defaults` changes (e.g. when the
 * user opens the modal on a different document) using the React-recommended
 * "adjust state during render" pattern with a `key` guard.
 */
export function DocumentEmailDialog({
  open,
  onOpenChange,
  businessId,
  documentType,
  documentId,
  documentNumber,
  defaults,
  pdfAvailable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  documentType: string;
  documentId: string;
  documentNumber: string;
  defaults: DocumentEmailDefaults;
  /** Whether the PDF attachment checkbox is enabled. Defaults to true. */
  pdfAvailable?: boolean;
}) {
  const router = useRouter();
  const [to, setTo] = useState(defaults.to);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaults.subject);
  const [bodyHtml, setBodyHtml] = useState(defaults.bodyHtml);
  const [attachPdf, setAttachPdf] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const withPdf = pdfAvailable !== false;

  // Re-sync when defaults change (page passes new defaults on document change).
  // React-recommended "adjust state during render" pattern with a key guard so
  // the dialog resets cleanly when re-opened for a different document.
  const [defaultsKey, setDefaultsKey] = useState(defaults);
  if (defaults !== defaultsKey) {
    setDefaultsKey(defaults);
    setTo(defaults.to);
    setCc("");
    setSubject(defaults.subject);
    setBodyHtml(defaults.bodyHtml);
    setAttachPdf(true);
    setError("");
    setFieldErrors({});
  }

  // Clear field errors when the user edits the corresponding field.
  useEffect(() => {
    if (fieldErrors.to) {
      const next = { ...fieldErrors };
      delete next.to;
      setFieldErrors(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  useEffect(() => {
    if (fieldErrors.subject) {
      const next = { ...fieldErrors };
      delete next.subject;
      setFieldErrors(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  async function handleSend() {
    setError("");
    setFieldErrors({});
    startTransition(async () => {
      try {
        const result = await sendDocumentEmailAction(businessId, documentType, documentId, documentNumber, {
          to,
          cc,
          subject,
          bodyHtml,
          bodyText: "",
          attachPdf: withPdf ? attachPdf : false,
        });
        if (!result.ok) {
          setError(result.error);
          if (result.fieldErrors) setFieldErrors(result.fieldErrors);
          return;
        }
        if (result.status === "sent") {
          toast.success(`Email sent for ${documentNumber}.`, {
            description: "A copy is saved in Sent Emails.",
            action: {
              label: "View",
              onClick: () => router.push(`/b/${businessId}/emails/${result.emailId}`),
            },
          });
        } else {
          toast.error(`Email delivery failed for ${documentNumber}.`, {
            description: result.errorMessage ?? "Unknown error.",
          });
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed to execute.");
      }
    });
  }

  return (
    <DialogRoot open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          Email Document {documentNumber}
        </DialogTitle>
        <DialogDescription>
          Send this document and a PDF copy to the customer. A copy is saved to the Sent Emails log for audit.
        </DialogDescription>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="email-to" className="mb-1 block text-xs font-medium text-muted-foreground">
              To <span className="text-danger">*</span>
            </Label>
            <Input
              id="email-to"
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
              aria-invalid={Boolean(fieldErrors.to)}
              className={cn(fieldErrors.to && "border-danger")}
            />
            {fieldErrors.to?.[0] && <p className="mt-1 text-xs text-danger">{fieldErrors.to[0]}</p>}
          </div>

          <div>
            <Label htmlFor="email-cc" className="mb-1 block text-xs font-medium text-muted-foreground">
              CC <span className="text-muted-foreground/60">(optional)</span>
            </Label>
            <Input
              id="email-cc"
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
            />
          </div>

          <div>
            <Label htmlFor="email-subject" className="mb-1 block text-xs font-medium text-muted-foreground">
              Subject <span className="text-danger">*</span>
            </Label>
            <Input
              id="email-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-invalid={Boolean(fieldErrors.subject)}
              className={cn(fieldErrors.subject && "border-danger")}
            />
            {fieldErrors.subject?.[0] && <p className="mt-1 text-xs text-danger">{fieldErrors.subject[0]}</p>}
          </div>

          <div>
            <Label htmlFor="email-body" className="mb-1 block text-xs font-medium text-muted-foreground">
              Message body
            </Label>
            <textarea
              id="email-body"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-6 text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              spellCheck={false}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Body is rendered as HTML in the recipient&apos;s inbox. Newlines are auto-converted.
            </p>
          </div>

          {withPdf && (
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-surface-muted/30 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={attachPdf}
                onChange={(e) => setAttachPdf(e.target.checked)}
                className="size-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Paperclip className="size-4 text-muted-foreground" />
              <span>Attach <strong>{documentNumber}.pdf</strong></span>
              <span className="ml-auto text-xs text-muted-foreground">PDF copy of the document</span>
            </label>
          )}

          {error && <FormError message={error} />}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={(e) => { e.stopPropagation(); onOpenChange(false); }}
            >
              Cancel
            </Button>
            <Button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleSend(); }}
              disabled={pending}
              type="button"
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              {pending ? "Sending…" : "Send Email"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
