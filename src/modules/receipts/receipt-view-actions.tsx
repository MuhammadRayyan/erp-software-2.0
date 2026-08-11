"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { voidReceiptAction } from "./actions";

export function ReceiptViewActions({
  businessId,
  receiptId,
  receiptNumber,
  status,
}: {
  businessId: string;
  receiptId: string;
  receiptNumber: string;
  status: "posted" | "void";
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function reverse() {
    setPending(true);
    setError("");
    const result = await voidReceiptAction(businessId, receiptId);
    setPending(false);
    if (result.error) return setError(result.error);
    setOpen(false);
    toast.success("Receipt reversed. The allocation and accounting effect are no longer active.");
    router.refresh();
  }

  if (status !== "posted") return null;
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Ban className="size-4" /> Reverse Receipt
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Reverse {receiptNumber}?</DialogTitle>
          <DialogDescription>
            This keeps the Receipt in history, releases its invoice allocation, and posts
            Debit Accounts Receivable / Credit Bank or Cash.
          </DialogDescription>
          {error && <div role="alert" className="mt-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={pending} onClick={reverse}>
              {pending ? "Reversing…" : "Reverse Receipt"}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
