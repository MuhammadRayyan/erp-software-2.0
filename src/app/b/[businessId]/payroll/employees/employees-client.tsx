"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Edit2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { toggleEmployeeActiveAction } from "@/modules/payroll/actions/payroll-actions";
import { EmployeeDialog } from "./employee-dialog";

interface EmployeesClientProps {
  businessId: string;
  employees: EmployeeRecord[];
}

export function EmployeesClient({ businessId, employees: initialEmployees }: EmployeesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);

  const filtered = initialEmployees.filter((emp) => {
    if (filterActive === "active" && !emp.isActive) return false;
    if (filterActive === "inactive" && emp.isActive) return false;

    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      emp.name.toLowerCase().includes(term) ||
      (emp.code && emp.code.toLowerCase().includes(term)) ||
      (emp.designation && emp.designation.toLowerCase().includes(term)) ||
      (emp.department && emp.department.toLowerCase().includes(term))
    );
  });

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

  const formatAED = (minor?: number | null) => {
    if (!minor || minor === 0) return "-";
    return `AED ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-4">
      {/* Action / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, code, designation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as any)}
            className="h-9 rounded-[6px] border border-border bg-surface-raised px-2.5 text-xs font-medium"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        <Button
          onClick={() => {
            setSelectedEmployee(null);
            setDialogOpen(true);
          }}
          className="h-9"
        >
          <Plus className="size-4 mr-1.5" /> New Employee
        </Button>
      </div>

      {/* Employees Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Designation & Dept</th>
                <th className="py-3 px-4">Joining Date</th>
                <th className="py-3 px-4 text-right">Basic Salary</th>
                <th className="py-3 px-4 text-right">Total Standard Pay</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No employees found matching your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const totalStandard =
                    (emp.basicSalaryMinor ?? 0) +
                    (emp.housingAllowanceMinor ?? 0) +
                    (emp.transportAllowanceMinor ?? 0) +
                    (emp.otherAllowancesMinor ?? 0);

                  return (
                    <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{emp.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {emp.code || "No code"} {emp.email ? `• ${emp.email}` : ""}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-foreground">{emp.designation || "-"}</div>
                        <div className="text-xs text-muted-foreground">{emp.department || "-"}</div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {emp.joiningDate || "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-foreground">
                        {formatAED(emp.basicSalaryMinor)}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-foreground">
                        {totalStandard > 0 ? formatAED(totalStandard) : "-"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge tone={emp.isActive ? "success" : "neutral"} className="text-xs">
                          {emp.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setDialogOpen(true);
                          }}
                          className="h-8 w-8 p-0"
                          title="Edit employee"
                        >
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(emp)}
                          className="h-8 w-8 p-0"
                          title={emp.isActive ? "Mark inactive" : "Mark active"}
                        >
                          {emp.isActive ? (
                            <XCircle className="size-3.5 text-danger" />
                          ) : (
                            <CheckCircle2 className="size-3.5 text-success" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
