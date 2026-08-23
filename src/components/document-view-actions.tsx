"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileEdit, FileText, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type DocumentViewActionsProps = {
  documentNumber: string;
  documentType: string;
  editHref: string;
  pdfHref?: string;
  status: string;
  onDuplicate: () => Promise<void>;
  onVoid: () => Promise<void>;
};

type Confirm = "duplicate" | "void" | null;

export function DocumentViewActions({
  documentNumber,
  documentType,
  editHref,
  pdfHref,
  status,
  onDuplicate,
  onVoid,
}: DocumentViewActionsProps) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleConfirm() {
    setPending(true);
    setError("");
    try {
      if (confirm === "duplicate") await onDuplicate();
      if (confirm === "void") await onVoid();
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="secondary" className="h-8 text-xs">
        <Link href={editHref}><FileEdit className="mr-1.5 size-3.5" />Edit</Link>
      </Button>
      {pdfHref && (
        <Button asChild variant="secondary" className="h-8 text-xs">
          <Link href={pdfHref} target="_blank"><FileText className="mr-1.5 size-3.5" />PDF</Link>
        </Button>
      )}
      <Button variant="secondary" className="h-8 text-xs" onClick={() => setConfirm("duplicate")}>
        <Copy className="mr-1.5 size-3.5" />Duplicate
      </Button>
      {status !== "void" && (
        <Button variant="secondary" className="h-8 text-xs text-danger hover:text-danger" onClick={() => setConfirm("void")}>
          <Trash2 className="mr-1.5 size-3.5" />Void
        </Button>
      )}

      <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open && !pending) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "duplicate" && `Duplicate ${documentType}`}
              {confirm === "void" && `Void ${documentType}`}
            </DialogTitle>
            <DialogDescription>
              {confirm === "duplicate" && `Are you sure you want to duplicate ${documentNumber}? A new draft will be created.`}
              {confirm === "void" && `Are you sure you want to void ${documentNumber}? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          {error && <div role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant={confirm === "void" ? "danger" : "primary"} disabled={pending} onClick={handleConfirm}>
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {confirm === "duplicate" && "Duplicate"}
              {confirm === "void" && "Void"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
