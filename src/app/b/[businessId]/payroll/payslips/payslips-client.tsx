"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookCheck, FileSpreadsheet, Play, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { type PayslipRecord, type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { PayslipTable } from "@/modules/payroll/payslip-table";
import { PayRunDialog } from "./pay-run-dialog";
import { WpsExportDialog } from "./wps-export-dialog";

interface PayslipsClientProps {
  businessId: string;
  payslips: PayslipRecord[];
  employees: EmployeeRecord[];
  currency?: string;
}

export function PayslipsClient({ businessId, payslips, employees, currency }: PayslipsClientProps) {
  const router = useRouter();
  const [payRunOpen, setPayRunOpen] = useState(false);
  const [wpsOpen, setWpsOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Payslips"
        description="Employee wage slips, earnings breakdowns, deductions, and General Ledger posting."
      >
        <Button permission="export" variant="secondary" onClick={() => setWpsOpen(true)}>
          <FileSpreadsheet className="size-4 text-primary" /> Export WPS (.SIF)
        </Button>
        <Button permission="create" variant="secondary" onClick={() => setPayRunOpen(true)}>
          <Play className="size-4 text-primary" /> Generate Pay Run
        </Button>
        <Button permission="post" variant="secondary" asChild>
          <Link href={`/b/${businessId}/payroll/gratuity`}>
            <BookCheck className="size-4 text-primary" /> Post Gratuity Accrual
          </Link>
        </Button>
        <Button permission="create" asChild>
          <Link href={`/b/${businessId}/payroll/payslips/new`}>
            <Plus className="size-4" /> New Payslip
          </Link>
        </Button>
      </PageHeader>
      <PayslipTable
        businessId={businessId}
        payslips={payslips}
        currency={currency}
      />

      <PayRunDialog
        businessId={businessId}
        employees={employees}
        currency={currency}
        open={payRunOpen}
        onOpenChange={setPayRunOpen}
        onGenerated={() => router.refresh()}
      />

      <WpsExportDialog
        businessId={businessId}
        currency={currency}
        open={wpsOpen}
        onOpenChange={setWpsOpen}
      />
    </>
  );
}
