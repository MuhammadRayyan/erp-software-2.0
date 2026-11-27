"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, Download, FileEdit, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogRoot, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActionPermission } from "@/components/permissions-provider";
import { FormError } from "@/components/form-error";
import type { InventoryDocumentStatus } from "./inventory-document";

/** List-row menu shared by delivery notes and goods receipts: edit a draft, download the PDF. */
export function StockDocumentRowActions({
  number,
  documentStatus,
  editHref,
  editLabel,
  pdfHref,
}: {
  number: string;
  documentStatus: string;
  editHref: string;
  editLabel: string;
  pdfHref: string;
}) {
  const canEdit = documentStatus === "draft";
  const canEditPerm = useActionPermission("edit");
  const canExportPerm = useActionPermission("export");
  if (!(canEdit && canEditPerm) && !canExportPerm) return null;
  return (
    <div className="flex items-center justify-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${number}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canEdit && (
            <DropdownMenuItem permission="edit" asChild>
              <Link href={editHref}>
                <FileEdit className="size-4 text-muted-foreground" /> {editLabel}
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem permission="export" asChild>
            <a href={pdfHref} target="_blank" rel="noreferrer">
              <Download className="size-4 text-muted-foreground" /> Download PDF
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type CommandResult = { error?: string };

/** Detail-page actions shared by delivery notes and goods receipts: edit, PDF, void a posted document, delete a draft. */
export function StockDocumentViewActions({
  number,
  status,
  basePath,
  documentId,
  pdfHref,
  voidAction,
  deleteAction,
  text,
}: {
  number: string;
  status: InventoryDocumentStatus;
  /** List path, e.g. `/b/<id>/sales/delivery-notes`. */
  basePath: string;
  documentId: string;
  pdfHref: string;
  voidAction: () => Promise<CommandResult>;
  deleteAction: () => Promise<CommandResult>;
  text: { deleted: string; voided: string; voidDescription: string; voidButton: string };
}) {
  const [confirm, setConfirm] = useState<"void" | "delete" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const canDelete = useActionPermission("delete");
  const hasMoreActions = status !== "void" && canDelete;

  async function run() {
    setPending(true);
    setError("");
    const result = confirm === "void" ? await voidAction() : await deleteAction();
    setPending(false);
    if (result.error) return setError(result.error);
    if (confirm === "delete") router.push(basePath);
    else router.refresh();
    setConfirm(null);
    toast.success(confirm === "delete" ? text.deleted : text.voided);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status !== "void" && (
          <Button permission={status === "posted" ? ["edit", "post"] : "edit"} asChild>
            <Link href={`${basePath}/${documentId}/edit`}><Pencil className="size-4" /> Edit</Link>
          </Button>
        )}
        <Button permission={"export"} asChild variant="secondary">
          <a href={pdfHref} target="_blank" rel="noreferrer"><Download className="size-4" /> Print / PDF</a>
        </Button>
        {hasMoreActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" aria-label="More actions">More <MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {status === "posted" && (
                <DropdownMenuItem permission="delete" className="text-danger focus:text-danger" onSelect={() => setConfirm("void")}>
                  <Ban className="size-4" /> Void
                </DropdownMenuItem>
              )}
              {status === "draft" && (
                <DropdownMenuItem permission="delete" className="text-danger focus:text-danger" onSelect={() => setConfirm("delete")}>
                  <Trash2 className="size-4" /> Delete draft
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <DialogRoot open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogTitle>{confirm === "void" ? `Void ${number}?` : `Delete ${number}?`}</DialogTitle>
          <DialogDescription>{confirm === "void" ? text.voidDescription : "This permanently removes the non-posting draft."}</DialogDescription>
          {error && <FormError message={error} />}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button permission={"delete"} variant="danger" disabled={pending} onClick={run}>
              {confirm === "void" ? text.voidButton : "Delete draft"}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
