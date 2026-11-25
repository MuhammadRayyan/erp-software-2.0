"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DialogRoot,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useActionPermission } from "@/components/permissions-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { formatMoney, getBusinessTodayIso } from "@/core/format";
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
  const canPost = useActionPermission("post");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ periodDate?: string; periodDescription?: string }>({});

  const today = getBusinessTodayIso();
  const currentMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "Asia/Dubai" }).format(new Date());

  const activeEmployees = employees.filter((e) => e.isActive);
  const [selectedIds, setSelectedIds] = useState<string[]>(activeEmployees.map((e) => e.id));
  const [autoPost, setAutoPost] = useState<boolean>(canPost);

  useEffect(() => {
    if (open) {
      setSelectedIds(employees.filter((e) => e.isActive).map((e) => e.id));
      setAutoPost(canPost);
      setError(null);
      setFieldErrors({});
    }
  }, [open, employees, canPost]);

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
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    const periodDate = formData.get("periodDate")?.toString().trim() || "";
    const periodDescription = formData.get("periodDescription")?.toString().trim() || "";
    const nextErrors: { periodDate?: string; periodDescription?: string } = {};
    if (!periodDate) nextErrors.periodDate = "Pay date is required.";
    if (!periodDescription) nextErrors.periodDescription = "Period description is required.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    if (selectedIds.length === 0) {
      setError("Please select at least one employee for the pay run.");
      return;
    }

    setLoading(true);
    const shouldPost = canPost && autoPost;

    try {
      const res = await generateBatchPayslipsAction(businessId, {
        periodDate,
        periodDescription,
        employeeIds: selectedIds,
        autoPost: shouldPost,
      });

      if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success(
          `Generated ${res.data?.createdCount ?? 0} payslips${shouldPost ? " and posted to General Ledger" : " as drafts"}.`
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
          <div className="mt-3">
            <FormError message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="periodDate">Pay Date *</Label>
              <Input
                id="periodDate"
                name="periodDate"
                type="date"
                defaultValue={today}
                required
                aria-invalid={!!fieldErrors.periodDate}
                onChange={() => fieldErrors.periodDate && setFieldErrors((p) => ({ ...p, periodDate: undefined }))}
              />
              {fieldErrors.periodDate && <FormError message={fieldErrors.periodDate} />}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="periodDescription">Period Description *</Label>
              <Input
                id="periodDescription"
                name="periodDescription"
                defaultValue={currentMonth}
                placeholder="e.g. October 2026"
                required
                aria-invalid={!!fieldErrors.periodDescription}
                onChange={() =>
                  fieldErrors.periodDescription &&
                  setFieldErrors((p) => ({ ...p, periodDescription: undefined }))
                }
              />
              {fieldErrors.periodDescription && <FormError message={fieldErrors.periodDescription} />}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Select Employees ({selectedIds.length} of {activeEmployees.length})</Label>
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
              checked={canPost && autoPost}
              disabled={!canPost}
              onChange={(e) => setAutoPost(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary size-4 disabled:opacity-50"
            />
            <Label htmlFor="autoPost" className={cn("cursor-pointer text-sm", !canPost && "text-muted-foreground")}>
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
            <Button permission={canPost && autoPost ? ["create", "post"] : "create"} type="submit" disabled={loading || selectedIds.length === 0}>
              {loading ? "Generating..." : `Generate ${selectedIds.length} Payslips`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
