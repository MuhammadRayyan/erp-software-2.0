"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { toggleEmployeeActiveAction } from "@/modules/payroll/actions/payroll-actions";
import { EmployeeTable } from "@/modules/payroll/employee-table";
import { EmployeeDialog } from "./employee-dialog";

interface EmployeesClientProps {
  businessId: string;
  employees: EmployeeRecord[];
  currency?: string;
}

export function EmployeesClient({ businessId, employees, currency }: EmployeesClientProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);

  const handleToggleActive = async (emp: EmployeeRecord) => {
    try {
      const res = await toggleEmployeeActiveAction(businessId, emp.id, !emp.isActive);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(
          emp.isActive
            ? `${emp.name} marked as inactive.`
            : `${emp.name} marked as active.`
        );
        router.refresh();
      }
    } catch {
      toast.error("Failed to update status.");
    }
  };

  return (
    <div className="space-y-4">
      <EmployeeTable
        businessId={businessId}
        employees={employees}
        currency={currency}
        onEditEmployee={(emp) => {
          setSelectedEmployee(emp);
          setDialogOpen(true);
        }}
        onToggleActive={handleToggleActive}
        onNewEmployee={() => {
          setSelectedEmployee(null);
          setDialogOpen(true);
        }}
      />

      <EmployeeDialog
        businessId={businessId}
        employee={selectedEmployee}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
