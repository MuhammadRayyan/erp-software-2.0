"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type PayslipRecord, type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { PayslipTable } from "@/modules/payroll/payslip-table";
import { PayRunDialog } from "./pay-run-dialog";

interface PayslipsClientProps {
  businessId: string;
  payslips: PayslipRecord[];
  employees: EmployeeRecord[];
  currency?: string;
}

export function PayslipsClient({ businessId, payslips, employees, currency }: PayslipsClientProps) {
  const router = useRouter();
  const [payRunOpen, setPayRunOpen] = useState(false);

  return (
    <div className="space-y-4">
      <PayslipTable
        businessId={businessId}
        payslips={payslips}
        currency={currency}
        onOpenPayRun={() => setPayRunOpen(true)}
      />

      <PayRunDialog
        businessId={businessId}
        employees={employees}
        currency={currency}
        open={payRunOpen}
        onOpenChange={setPayRunOpen}
        onGenerated={() => router.refresh()}
      />
    </div>
  );
}
