"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  DialogRoot,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/format";
import { useTableDensity } from "@/components/use-table-density";
import { cn } from "@/lib/cn";
import { type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { generateBatchPayslipsAction } from "@/modules/payroll/actions/payroll-actions";

interface PayRunDialogProps {
  businessId: string;
  employees: EmployeeRecord[];
  currency?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated?: () => void;
}

export function PayRunDialog({
  businessId,
  employees,
  currency = "AED",
  open,
  onOpenChange,
  onGenerated,
}: PayRunDialogProps) {
  const { density } = useTableDensity(businessId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());

  const activeEmployees = employees.filter((e) => e.isActive);
  const [selectedIds, setSelectedIds] = useState<string[]>(activeEmployees.map((e) => e.id));

  const toggleAll = () => {
    if (selectedIds.length === activeEmployees.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(activeEmployees.map((e) => e.id));
    }
  };

  const toggleEmployee = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (selectedIds.length === 0) {
      setError("Please select at least one employee for the pay run.");
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const periodDate = formData.get("periodDate")?.toString() || today;
    const periodDescription = formData.get("periodDescription")?.toString() || currentMonth;
    const autoPost = formData.get("autoPost") === "on";

    try {
      const res = await generateBatchPayslipsAction(businessId, {
        periodDate,
        periodDescription,
        employeeIds: selectedIds,
        autoPost,
      });

      if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success(
          `Generated ${res.data?.createdCount ?? 0} payslips${autoPost ? " and posted to General Ledger" : " as drafts"}.`
        );
        onOpenChange(false);
        onGenerated?.();
      }
    } catch {
      setError("Failed to execute pay run.");
      toast.error("Failed to execute pay run.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogTitle>Generate Monthly Pay Run</DialogTitle>
        <DialogDescription>
          Generate regular monthly payslips for active employees from their predefined compensation structures in one click.
        </DialogDescription>

        {error && (
          <div className="mt-3 p-3 text-sm rounded bg-danger/10 border border-danger/30 text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="periodDate">Pay Date *</Label>
              <Input
                id="periodDate"
                name="periodDate"
                type="date"
                defaultValue={today}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="periodDescription">Period Description *</Label>
              <Input
                id="periodDescription"
                name="periodDescription"
                defaultValue={currentMonth}
                placeholder="e.g. October 2026"
                required
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Select Employees ({selectedIds.length} of {activeEmployees.length})</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleAll}
                className="h-7 text-xs text-primary"
              >
                {selectedIds.length === activeEmployees.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <div className="data-panel max-h-56 overflow-y-auto">
              {activeEmployees.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No active employees found. Please add or activate employees first.
                </div>
              ) : (
                <table className="data-table w-full" data-density={density}>
                  <thead>
                    <tr>
                      <th className="w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.length === activeEmployees.length && activeEmployees.length > 0}
                          onChange={toggleAll}
                          aria-label="Select all active employees"
                          className="rounded border-border text-primary focus:ring-primary size-4"
                        />
                      </th>
                      <th>Employee</th>
                      <th>Designation & Dept</th>
                      <th className="col-numeric text-right!">Monthly Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEmployees.map((emp) => {
                      const total =
                        (emp.basicSalaryMinor ?? 0) +
                        (emp.housingAllowanceMinor ?? 0) +
                        (emp.transportAllowanceMinor ?? 0) +
                        (emp.otherAllowancesMinor ?? 0);
                      const isChecked = selectedIds.includes(emp.id);

                      return (
                        <tr
                          key={emp.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            isChecked ? "bg-primary/5 font-medium" : "hover:bg-surface-muted"
                          )}
                          onClick={() => toggleEmployee(emp.id)}
                        >
                          <td className="text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleEmployee(emp.id)}
                              aria-label={`Select ${emp.name}`}
                              className="rounded border-border text-primary focus:ring-primary size-4"
                            />
                          </td>
                          <td>
                            <div className="font-medium text-foreground">{emp.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {emp.code || "No code"}
                            </div>
                          </td>
                          <td className="text-xs text-muted-foreground">
                            {emp.designation || emp.department || "—"}
                          </td>
                          <td className="money text-right font-medium text-foreground">
                            {formatMoney(total, currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="autoPost"
              name="autoPost"
              defaultChecked={true}
              className="rounded border-border text-primary focus:ring-primary size-4"
            />
            <Label htmlFor="autoPost" className="cursor-pointer text-sm">
              Automatically post to General Ledger (Credits 2200 Payroll Payable, Debits 6100 Salaries Expense)
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || selectedIds.length === 0}>
              {loading ? "Generating..." : `Generate ${selectedIds.length} Payslips`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
