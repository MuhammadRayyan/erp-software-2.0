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
import { voidSupplierPaymentAction } from "./actions";

export function SupplierPaymentViewActions({
  businessId,
  paymentId,
  paymentNumber,
  status,
}: {
  businessId: string;
  paymentId: string;
  paymentNumber: string;
  status: "posted" | "void";
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function reverse() {
    setPending(true);
    setError("");
    const result = await voidSupplierPaymentAction(businessId, paymentId);
    setPending(false);
    if (result.error) return setError(result.error);
    setOpen(false);
    toast.success("Supplier Payment reversed. The payable allocation is active again.");
    router.refresh();
  }

  if (status !== "posted") return null;
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Ban className="size-4" /> Reverse Payment
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Reverse {paymentNumber}?</DialogTitle>
          <DialogDescription>
            This keeps the Supplier Payment in history, releases its invoice allocation,
            and posts Debit Bank or Cash / Credit Accounts Payable.
          </DialogDescription>
          {error && <div role="alert" className="mt-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={pending} onClick={reverse}>
              {pending ? "Reversing…" : "Reverse Payment"}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  );
}
