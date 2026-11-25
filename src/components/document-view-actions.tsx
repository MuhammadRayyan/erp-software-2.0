"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, ChevronDown, Copy, Download, FileEdit, FileText, Mail, MoreHorizontal, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActionPermission } from "@/components/permissions-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type CopyToAction = {
  label: string;
  href?: string;
  action?: () => Promise<void | { error?: string }>;
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
  autoOpenEmail?: boolean;
  onDuplicate?: () => Promise<void | { error?: string }>;
  onVoid?: { label: string; description: string; action: () => Promise<void | { error?: string }> };
  onDelete?: { label: string; description: string; action: () => Promise<void | { error?: string }> };
  onClose?: {
    label: string;
    description: string;
    action: () => Promise<void | { error?: string }>;
    tone?: "primary" | "danger";
    icon?: "check" | "ban";
  };
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
  autoOpenEmail,
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
  const autoOpenedRef = useRef(false);
  const canEdit = useActionPermission("edit");
  const canCreate = useActionPermission("create");
  const canDelete = useActionPermission("delete");
  const canExport = useActionPermission("export");

  const hasDesktopUpperItems = Boolean((xmlHref && canExport) || (onDuplicate && canCreate) || extraActions);
  const hasDesktopLowerItems = Boolean((onClose && canEdit) || (onVoid && canDelete) || (onDelete && canDelete));
  const hasAnyDesktopMoreItems = hasDesktopUpperItems || hasDesktopLowerItems;

  useEffect(() => {
    if (!autoOpenEmail || !onEmail || !canExport || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    onEmail();
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("composeEmail")) {
        url.searchParams.delete("composeEmail");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [autoOpenEmail, onEmail, canExport]);

  async function handleConfirm() {
    setPending(true);
    setError("");
    try {
      let res: void | { error?: string } = undefined;
      if (confirm === "duplicate" && onDuplicate) res = await onDuplicate();
      if (confirm === "void" && onVoid) res = await onVoid.action();
      if (confirm === "delete" && onDelete) res = await onDelete.action();
      if (confirm === "close" && onClose) res = await onClose.action();
      if (res && typeof res === "object" && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      setConfirm(null);
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
          <Button permission="edit" variant={extraPrimaryActions ? "secondary" : "primary"} asChild>
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
                          const res = await actionItem.action!();
                          if (res && typeof res === "object" && "error" in res && res.error) {
                            setError(res.error);
                            toast.error(res.error);
                          }
                        } catch (err: any) {
                          const msg = err?.message || "Action failed";
                          setError(msg);
                          toast.error(msg);
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
          <Button permission="export" variant="secondary" className="hidden md:inline-flex" onClick={onEmail}>
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
          <Button permission="export" asChild variant="secondary" className="hidden md:inline-flex">
            <a href={pdfHref} target="_blank" rel="noreferrer"><Download className="size-4" /> Download PDF</a>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              aria-label="More actions"
              className={!hasAnyDesktopMoreItems ? "md:hidden" : undefined}
            >
              More <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className="md:hidden" onSelect={() => window.print()}>
              <Printer className="size-4" /> Print
            </DropdownMenuItem>
            {onEmail && (
              <DropdownMenuItem permission="export" className="md:hidden" onSelect={(e) => { e.preventDefault(); onEmail(); }}>
                <Mail className="size-4" /> Email
              </DropdownMenuItem>
            )}
            {xmlHref && (
              <DropdownMenuItem permission="export" asChild>
                <Link href={xmlHref}><FileText className="size-4" /> View XML</Link>
              </DropdownMenuItem>
            )}

            {pdfHref && (
              <DropdownMenuItem permission="export" asChild className="md:hidden">
                <a href={pdfHref} target="_blank" rel="noreferrer">
                  <Download className="size-4" /> Download PDF
                </a>
              </DropdownMenuItem>
            )}

            {onDuplicate && (
              <DropdownMenuItem permission="create" disabled={pending} onSelect={() => { setError(""); setConfirm("duplicate"); }}>
                <Copy className="size-4" /> Duplicate
              </DropdownMenuItem>
            )}

            {extraActions}

            {hasDesktopLowerItems && (
              <DropdownMenuSeparator className={!hasDesktopUpperItems ? "md:hidden" : undefined} />
            )}

            {onClose && (
              <DropdownMenuItem permission="edit" onSelect={() => { setError(""); setConfirm("close"); }}>
                {onClose.icon === "check" ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />} {onClose.label}
              </DropdownMenuItem>
            )}

            {onVoid && (
              <DropdownMenuItem permission="delete" className="text-danger focus:text-danger" onSelect={() => { setError(""); setConfirm("void"); }}>
                <Ban className="size-4" /> {onVoid.label}
              </DropdownMenuItem>
            )}

            {onDelete && (
              <DropdownMenuItem permission="delete" className="text-danger focus:text-danger" onSelect={() => { setError(""); setConfirm("delete"); }}>
                <Trash2 className="size-4" /> {onDelete.label}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirm(null);
        }}
        title={
          confirm === "duplicate"
            ? `Duplicate ${documentType}?`
            : confirm === "void"
              ? `${onVoid?.label} ${documentNumber}?`
              : confirm === "delete"
                ? `${onDelete?.label} ${documentNumber}?`
                : `${onClose?.label} ${documentNumber}?`
        }
        description={
          confirm === "duplicate"
            ? `Are you sure you want to duplicate ${documentNumber}? A new draft will be created.`
            : confirm === "void"
              ? onVoid?.description
              : confirm === "delete"
                ? onDelete?.description
                : onClose?.description
        }
        confirmLabel={
          confirm === "duplicate"
            ? "Duplicate"
            : confirm === "void"
              ? (onVoid?.label ?? "Confirm")
              : confirm === "delete"
                ? (onDelete?.label ?? "Delete")
                : (onClose?.label ?? "Confirm")
        }
        tone={
          confirm === "duplicate"
            ? "primary"
            : confirm === "close"
              ? (onClose?.tone ?? "danger")
              : "danger"
        }
        pending={pending}
        error={error}
        onConfirm={handleConfirm}
      />
    </>
  );
}
