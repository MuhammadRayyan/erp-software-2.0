"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentViewActions } from "@/components/document-view-actions";
import { useActionPermission, useApprovalPolicy } from "@/components/permissions-provider";
import { broadcastLiveRefresh } from "@/components/use-live-refresh";
import {
  deleteDraftSupplierPaymentAction,
  submitOrPostDraftSupplierPaymentAction,
  voidSupplierPaymentAction,
} from "./actions";

export function SupplierPaymentViewActions({
  businessId,
  paymentId,
  paymentNumber,
  status,
}: {
  businessId: string;
  paymentId: string;
  paymentNumber: string;
  status: "draft" | "pending_approval" | "posted" | "void";
}) {
  const router = useRouter();
  const { requiresApproval } = useApprovalPolicy();
  const canPost = useActionPermission("post");
  const mustSubmitForApproval = requiresApproval || !canPost;
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitOrPost = async () => {
    setSubmitting(true);
    try {
      const result = await submitOrPostDraftSupplierPaymentAction(
        businessId,
        paymentId,
        mustSubmitForApproval ? "submit_approval" : "post",
      );
      if (result.error) throw new Error(result.error);
      broadcastLiveRefresh();
      toast.success(
        result.documentStatus === "pending_approval"
          ? "Payment submitted for approval."
          : "Supplier payment posted to ledger.",
      );
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not submit supplier payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DocumentViewActions
      documentNumber={paymentNumber}
      documentType="Supplier Payment"
      pdfHref={`/api/businesses/${businessId}/documents/supplier-payment/${paymentId}/pdf`}
      extraPrimaryActions={
        status === "draft" ? (
          <Button
            permission={mustSubmitForApproval ? "edit" : "post"}
            disabled={submitting}
            onClick={handleSubmitOrPost}
          >
            <CheckCircle2 className="size-4" />
            {submitting
              ? mustSubmitForApproval
                ? "Submitting..."
                : "Posting..."
              : mustSubmitForApproval
                ? "Submit for Approval"
                : "Post Payment"}
          </Button>
        ) : undefined
      }
      onDelete={
        status === "draft"
          ? {
              label: "Delete draft",
              description:
                "This draft supplier payment has no journal entries and will be permanently removed.",
              action: async () => {
                const res = await deleteDraftSupplierPaymentAction(businessId, paymentId);
                if (res.error) throw new Error(res.error);
                broadcastLiveRefresh();
                toast.success("Draft supplier payment deleted.");
                router.push(`/b/${businessId}/purchases/payments`);
              },
            }
          : undefined
      }
      onVoid={
        status === "posted"
          ? {
              label: "Reverse Payment",
              description:
                "This posts a full reversing journal and re-opens the supplier invoices settled by this payment.",
              action: async () => {
                const res = await voidSupplierPaymentAction(businessId, paymentId);
                if (res.error) throw new Error(res.error);
                toast.success("Supplier Payment reversed.");
                router.refresh();
              },
            }
          : undefined
      }
    />
  );
}
