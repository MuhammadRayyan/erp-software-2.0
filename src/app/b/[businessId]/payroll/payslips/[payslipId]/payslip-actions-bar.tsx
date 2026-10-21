"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer, Download, Ban, CheckCircle2, Edit } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { postPayslipAction, voidPayslipAction } from "@/modules/payroll/actions/payroll-actions";

interface PayslipActionsBarProps {
  businessId: string;
  payslipId: string;
  status: "draft" | "posted" | "void";
  journalEntryId?: string | null;
}

export function PayslipActionsBar({
  businessId,
  payslipId,
  status,
  journalEntryId,
}: PayslipActionsBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePost = async () => {
    setLoading(true);
    try {
      const res = await postPayslipAction(businessId, payslipId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Payslip successfully posted to General Ledger.");
        router.refresh();
      }
    } catch {
      toast.error("Failed to post payslip.");
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async () => {
    if (!confirm("Are you sure you want to void this payslip? This will reverse the General Ledger journal entry.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await voidPayslipAction(businessId, payslipId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Payslip voided and ledger reversed.");
        router.refresh();
      }
    } catch {
      toast.error("Failed to void payslip.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const pdfUrl = `/api/businesses/${businessId}/documents/payslip/${payslipId}/pdf`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        {journalEntryId && (
          <Link
            href={`/b/${businessId}/accounting/journal`}
            className="text-xs text-primary hover:underline ml-2"
          >
            View General Ledger Entry
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={handlePrint} className="h-8">
          <Printer className="size-3.5 mr-1.5" /> Print
        </Button>

        <Button asChild variant="secondary" size="sm" className="h-8">
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
            <Download className="size-3.5 mr-1.5" /> Download PDF
          </a>
        </Button>

        {status === "draft" && (
          <>
            <Button asChild variant="secondary" size="sm" className="h-8">
              <Link href={`/b/${businessId}/payroll/payslips/${payslipId}/edit`}>
                <Edit className="size-3.5 mr-1.5" /> Edit
              </Link>
            </Button>
            <Button size="sm" onClick={handlePost} disabled={loading} className="h-8">
              <CheckCircle2 className="size-3.5 mr-1.5" /> Post to Ledger
            </Button>
          </>
        )}

        {status === "posted" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleVoid}
            disabled={loading}
            className="h-8 text-danger hover:bg-danger/10 border-danger/30"
          >
            <Ban className="size-3.5 mr-1.5" /> Void / Unpost
          </Button>
        )}
      </div>
    </div>
  );
}
