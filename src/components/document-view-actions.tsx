"use client";
import { useState } from "react";
import Link from "next/link";
import { Ban, ChevronDown, Copy, Download, FileEdit, FileText, LoaderCircle, Mail, MoreHorizontal, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormError } from "@/components/form-error";

export type CopyToAction = {
  label: string;
  href?: string;
  action?: () => Promise<void>;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

type DocumentViewActionsProps = {
  documentNumber: string;
  documentType: string;
  editHref?: string;
  pdfHref?: string;
  xmlHref?: string;
  /** Optional email handler — when provided, the Email button is wired to this callback (e.g. opens a compose dialog). */
  onEmail?: () => void;
  onDuplicate?: () => Promise<void>;
  onVoid?: { label: string; description: string; action: () => Promise<void> };
  onDelete?: { label: string; description: string; action: () => Promise<void> };
  onClose?: { label: string; description: string; action: () => Promise<void> };
  copyToActions?: CopyToAction[];
  extraActions?: React.ReactNode;
  extraPrimaryActions?: React.ReactNode;
};

type ConfirmState = "duplicate" | "void" | "delete" | "close" | null;

export function DocumentViewActions({
  documentNumber,
  documentType,
  editHref,
  pdfHref,
  xmlHref,
  onEmail,
  onDuplicate,
  onVoid,
  onDelete,
  onClose,
  copyToActions,
  extraActions,
  extraPrimaryActions,
}: DocumentViewActionsProps) {
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setPending(true);
    setError("");
    try {
      if (confirm === "duplicate" && onDuplicate) await onDuplicate();
      if (confirm === "void" && onVoid) await onVoid.action();
      if (confirm === "delete" && onDelete) await onDelete.action();
      if (confirm === "close" && onClose) await onClose.action();
      if (!error) setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {editHref && (
          <Button asChild>
            <Link href={editHref}><FileEdit className="size-4" /> Edit</Link>
          </Button>
        )}

        {extraPrimaryActions}

        {copyToActions && copyToActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="inline-flex items-center gap-1.5" aria-label="Copy to other document">
                <Copy className="size-4" />
                <span>Copy to</span>
                <ChevronDown className="size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {copyToActions.map((actionItem, idx) => {
                const Icon = actionItem.icon;
                if (actionItem.href) {
                  return (
                    <DropdownMenuItem key={idx} asChild disabled={actionItem.disabled}>
                      <Link href={actionItem.href} className="flex items-center gap-2">
                        {Icon && <Icon className="size-4 text-muted-foreground" />}
                        <span>{actionItem.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                }
                if (actionItem.action) {
                  return (
                    <DropdownMenuItem
                      key={idx}
                      disabled={actionItem.disabled || pending}
                      onSelect={async () => {
                        setPending(true);
                        setError("");
                        try {
                          await actionItem.action!();
                        } catch (err: any) {
                          setError(err.message || "Action failed");
                        } finally {
                          setPending(false);
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      {Icon && <Icon className="size-4 text-muted-foreground" />}
                      <span>{actionItem.label}</span>
                    </DropdownMenuItem>
                  );
                }
                return null;
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onEmail && (
          <Button variant="secondary" className="hidden md:inline-flex" onClick={onEmail}>
            <Mail className="size-4" /> Email
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          className="hidden md:inline-flex"
          onClick={() => window.print()}
        >
          <Printer className="size-4" /> Print
        </Button>

        {pdfHref && (
          <Button asChild variant="secondary" className="hidden md:inline-flex">
            <a href={pdfHref} target="_blank" rel="noreferrer"><Download className="size-4" /> PDF</a>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" aria-label="More actions">
              More <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className="md:hidden" onSelect={() => window.print()}>
              <Printer className="size-4" /> Print
            </DropdownMenuItem>
            {onEmail && (
              <DropdownMenuItem className="md:hidden" onSelect={(e) => { e.preventDefault(); onEmail(); }}>
                <Mail className="size-4" /> Email
              </DropdownMenuItem>
            )}
            {xmlHref && (
              <DropdownMenuItem asChild>
                <Link href={xmlHref}><FileText className="size-4" /> View XML</Link>
              </DropdownMenuItem>
            )}

            {pdfHref && (
              <DropdownMenuItem asChild className="md:hidden">
                <a href={pdfHref} target="_blank" rel="noreferrer">
                  <Download className="size-4" /> Download PDF
                </a>
              </DropdownMenuItem>
            )}

            {onDuplicate && (
              <DropdownMenuItem disabled={pending} onSelect={() => { setError(""); setConfirm("duplicate"); }}>
                <Copy className="size-4" /> Duplicate
              </DropdownMenuItem>
            )}

            {extraActions}

            {(onVoid || onDelete || onClose) && <DropdownMenuSeparator />}

            {onClose && (
              <DropdownMenuItem onSelect={() => { setError(""); setConfirm("close"); }}>
                <Ban className="size-4" /> {onClose.label}
              </DropdownMenuItem>
            )}

            {onVoid && (
              <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => { setError(""); setConfirm("void"); }}>
                <Ban className="size-4" /> {onVoid.label}
              </DropdownMenuItem>
            )}

            {onDelete && (
              <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => { setError(""); setConfirm("delete"); }}>
                <Trash2 className="size-4" /> {onDelete.label}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DialogRoot open={confirm !== null} onOpenChange={(open) => { if (!open && !pending) setConfirm(null); }}>
        <DialogContent>
          <DialogTitle>
            {confirm === "duplicate" && `Duplicate ${documentType}?`}
            {confirm === "void" && `${onVoid?.label} ${documentNumber}?`}
            {confirm === "delete" && `${onDelete?.label} ${documentNumber}?`}
            {confirm === "close" && `${onClose?.label} ${documentNumber}?`}
          </DialogTitle>
          <DialogDescription>
            {confirm === "duplicate" && `Are you sure you want to duplicate ${documentNumber}? A new draft will be created.`}
            {confirm === "void" && onVoid?.description}
            {confirm === "delete" && onDelete?.description}
            {confirm === "close" && onClose?.description}
          </DialogDescription>
          {error && <FormError message={error} />}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant={confirm === "duplicate" ? "primary" : "danger"} disabled={pending} onClick={handleConfirm}>
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {confirm === "duplicate" && "Duplicate"}
              {confirm === "void" && onVoid?.label}
              {confirm === "delete" && onDelete?.label}
              {confirm === "close" && onClose?.label}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
