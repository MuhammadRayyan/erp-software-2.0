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
import { type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { saveEmployeeAction } from "@/modules/payroll/actions/payroll-actions";

interface EmployeeDialogProps {
  businessId: string;
  employee?: EmployeeRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EmployeeDialog({
  businessId,
  employee,
  open,
  onOpenChange,
  onSaved,
}: EmployeeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(employee?.id);

  // Salary amounts in minor units (fils) converted to major units (AED)
  const basicAED = employee?.basicSalaryMinor ? (employee.basicSalaryMinor / 100).toFixed(2) : "";
  const housingAED = employee?.housingAllowanceMinor ? (employee.housingAllowanceMinor / 100).toFixed(2) : "";
  const transportAED = employee?.transportAllowanceMinor ? (employee.transportAllowanceMinor / 100).toFixed(2) : "";
  const otherAED = employee?.otherAllowancesMinor ? (employee.otherAllowancesMinor / 100).toFixed(2) : "";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const basicVal = formData.get("basicSalary")?.toString().trim();
    const housingVal = formData.get("housingAllowance")?.toString().trim();
    const transportVal = formData.get("transportAllowance")?.toString().trim();
    const otherVal = formData.get("otherAllowances")?.toString().trim();

    const parseAEDToMinor = (val?: string) => {
      if (!val) return 0;
      const num = parseFloat(val);
      return isNaN(num) ? 0 : Math.round(num * 100);
    };

    const payload = {
      id: employee?.id,
      name: formData.get("name")?.toString().trim() || "",
      code: formData.get("code")?.toString().trim() || null,
      designation: formData.get("designation")?.toString().trim() || null,
      department: formData.get("department")?.toString().trim() || null,
      joiningDate: formData.get("joiningDate")?.toString().trim() || null,
      email: formData.get("email")?.toString().trim() || null,
      phone: formData.get("phone")?.toString().trim() || null,
      address: formData.get("address")?.toString().trim() || null,
      basicSalaryMinor: parseAEDToMinor(basicVal),
      housingAllowanceMinor: parseAEDToMinor(housingVal),
      transportAllowanceMinor: parseAEDToMinor(transportVal),
      otherAllowancesMinor: parseAEDToMinor(otherVal),
      isActive: formData.get("isActive") === "on",
    };

    try {
      const res = await saveEmployeeAction(businessId, payload);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
      } else {
        toast.success(isEdit ? "Employee updated successfully" : "Employee created successfully");
        onOpenChange(false);
        onSaved?.();
      }
    } catch {
      setError("An unexpected error occurred.");
      toast.error("Failed to save employee.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogTitle>{isEdit ? "Edit Employee" : "New Employee"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update the employee master details and default compensation structure."
            : "Add a new employee to your master payroll directory."}
        </DialogDescription>

        {error && (
          <div className="mt-3 p-3 text-sm rounded bg-danger/10 border border-danger/30 text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={employee?.name || ""}
                placeholder="e.g. Mohammed Salem"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="code">Employee Code / ID</Label>
              <Input
                id="code"
                name="code"
                defaultValue={employee?.code || ""}
                placeholder="e.g. EMP-001"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="joiningDate">Joining Date</Label>
              <Input
                id="joiningDate"
                name="joiningDate"
                type="date"
                defaultValue={employee?.joiningDate || ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="designation">Designation / Role</Label>
              <Input
                id="designation"
                name="designation"
                defaultValue={employee?.designation || ""}
                placeholder="e.g. Project Engineer"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                name="department"
                defaultValue={employee?.department || ""}
                placeholder="e.g. Operations / Technical"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={employee?.email || ""}
                placeholder="employee@company.ae"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone / Mobile</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={employee?.phone || ""}
                placeholder="+971 50 123 4567"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address / UAE Location</Label>
              <Input
                id="address"
                name="address"
                defaultValue={employee?.address || ""}
                placeholder="e.g. Deira, Dubai, UAE"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <h4 className="text-sm font-medium text-foreground mb-1">Standard Monthly Salary Structure</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Standard monthly amounts in AED used for 1-click batch pay runs and EOSB computations.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="basicSalary" className="text-xs">Basic Salary (AED)</Label>
                <Input
                  id="basicSalary"
                  name="basicSalary"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={basicAED}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="housingAllowance" className="text-xs">Housing (AED)</Label>
                <Input
                  id="housingAllowance"
                  name="housingAllowance"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={housingAED}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="transportAllowance" className="text-xs">Transport (AED)</Label>
                <Input
                  id="transportAllowance"
                  name="transportAllowance"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={transportAED}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="otherAllowances" className="text-xs">Other (AED)</Label>
                <Input
                  id="otherAllowances"
                  name="otherAllowances"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={otherAED}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked={employee ? employee.isActive : true}
              className="rounded border-border text-primary focus:ring-primary size-4"
            />
            <Label htmlFor="isActive" className="cursor-pointer text-sm">
              Active employee (included in regular payroll)
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
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Update Employee" : "Create Employee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
