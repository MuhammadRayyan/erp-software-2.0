"use client";

import { useEffect, useState } from "react";
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
import { FormError } from "@/components/form-error";
import { getCurrencyMinorUnit, minorToDecimalString } from "@/core/format";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { saveEmployeeAction } from "@/modules/payroll/actions/payroll-actions";

interface EmployeeDialogProps {
  businessId: string;
  employee?: EmployeeRecord | null;
  currency?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EmployeeDialog({
  businessId,
  employee,
  currency = "AED",
  open,
  onOpenChange,
  onSaved,
}: EmployeeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isEdit = Boolean(employee?.id);
  const minorUnit = getCurrencyMinorUnit(currency);
  const amountStep = minorUnit === 0 ? "1" : minorUnit === 3 ? "0.001" : "0.01";
  const amountPlaceholder = minorToDecimalString(0, currency);

  useEffect(() => {
    if (open) {
      setError(null);
      setFieldErrors({});
    }
  }, [open, employee?.id]);

  // Salary amounts in minor units converted to business currency display string
  const basicAED = employee?.basicSalaryMinor ? minorToDecimalString(employee.basicSalaryMinor, currency) : "";
  const housingAED = employee?.housingAllowanceMinor ? minorToDecimalString(employee.housingAllowanceMinor, currency) : "";
  const transportAED = employee?.transportAllowanceMinor ? minorToDecimalString(employee.transportAllowanceMinor, currency) : "";
  const otherAED = employee?.otherAllowancesMinor ? minorToDecimalString(employee.otherAllowancesMinor, currency) : "";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    const trimmedName = formData.get("name")?.toString().trim() || "";
    const emailVal = formData.get("email")?.toString().trim() || "";
    const basicVal = formData.get("basicSalary")?.toString().trim() || "";
    const housingVal = formData.get("housingAllowance")?.toString().trim() || "";
    const transportVal = formData.get("transportAllowance")?.toString().trim() || "";
    const otherVal = formData.get("otherAllowances")?.toString().trim() || "";

    const nextFieldErrors: Record<string, string> = {};
    if (!trimmedName) {
      nextFieldErrors.name = "Employee full name is required.";
    }
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      nextFieldErrors.email = "Invalid email address.";
    }

    const parseAmountField = (val: string, fieldKey: string, label: string) => {
      if (!val) return 0;
      try {
        return parseCurrencyAmountToMinor(val, minorUnit, label);
      } catch (err) {
        nextFieldErrors[fieldKey] =
          err instanceof Error ? err.message : `${label} must be a valid non-negative amount.`;
        return 0;
      }
    };

    const basicSalaryMinor = parseAmountField(basicVal, "basicSalaryMinor", "Basic salary");
    const housingAllowanceMinor = parseAmountField(housingVal, "housingAllowanceMinor", "Housing allowance");
    const transportAllowanceMinor = parseAmountField(transportVal, "transportAllowanceMinor", "Transport allowance");
    const otherAllowancesMinor = parseAmountField(otherVal, "otherAllowancesMinor", "Other allowances");

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setLoading(true);

    const payload = {
      id: employee?.id,
      name: trimmedName,
      code: formData.get("code")?.toString().trim() || null,
      designation: formData.get("designation")?.toString().trim() || null,
      department: formData.get("department")?.toString().trim() || null,
      joiningDate: formData.get("joiningDate")?.toString().trim() || null,
      email: emailVal || null,
      phone: formData.get("phone")?.toString().trim() || null,
      address: formData.get("address")?.toString().trim() || null,
      basicSalaryMinor,
      housingAllowanceMinor,
      transportAllowanceMinor,
      otherAllowancesMinor,
      molPersonId: formData.get("molPersonId")?.toString().trim() || null,
      bankRoutingCode: formData.get("bankRoutingCode")?.toString().trim() || null,
      iban: formData.get("iban")?.toString().replace(/\s+/g, "").toUpperCase() || null,
      wpsEnabled: formData.get("wpsEnabled") === "on",
      isActive: formData.get("isActive") === "on",
    };

    try {
      const res = await saveEmployeeAction(businessId, payload);
      if (res.fieldErrors) {
        const mapped: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(res.fieldErrors)) {
          if (msgs?.[0]) mapped[k] = msgs[0];
        }
        setFieldErrors(mapped);
      }
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
          <div className="mt-3">
            <FormError message={error} />
          </div>
        )}

        <form key={`${employee?.id ?? "new"}-${open}`} onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={employee?.name || ""}
                placeholder="e.g. Mohammed Salem"
                required
                aria-invalid={!!fieldErrors.name}
                onChange={() => fieldErrors.name && setFieldErrors((p) => { const n = { ...p }; delete n.name; return n; })}
              />
              {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
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
                aria-invalid={!!fieldErrors.email}
                onChange={() => fieldErrors.email && setFieldErrors((p) => { const n = { ...p }; delete n.email; return n; })}
              />
              {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
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
              Standard monthly amounts in {currency} used for 1-click batch pay runs and EOSB computations.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="basicSalary" className="text-xs">Basic Salary ({currency})</Label>
                <Input
                  id="basicSalary"
                  name="basicSalary"
                  type="number"
                  step={amountStep}
                  min="0"
                  defaultValue={basicAED}
                  placeholder={amountPlaceholder}
                  aria-invalid={!!fieldErrors.basicSalaryMinor}
                />
                {fieldErrors.basicSalaryMinor && <p className="field-error">{fieldErrors.basicSalaryMinor}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="housingAllowance" className="text-xs">Housing ({currency})</Label>
                <Input
                  id="housingAllowance"
                  name="housingAllowance"
                  type="number"
                  step={amountStep}
                  min="0"
                  defaultValue={housingAED}
                  placeholder={amountPlaceholder}
                  aria-invalid={!!fieldErrors.housingAllowanceMinor}
                />
                {fieldErrors.housingAllowanceMinor && <p className="field-error">{fieldErrors.housingAllowanceMinor}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="transportAllowance" className="text-xs">Transport ({currency})</Label>
                <Input
                  id="transportAllowance"
                  name="transportAllowance"
                  type="number"
                  step={amountStep}
                  min="0"
                  defaultValue={transportAED}
                  placeholder={amountPlaceholder}
                  aria-invalid={!!fieldErrors.transportAllowanceMinor}
                />
                {fieldErrors.transportAllowanceMinor && <p className="field-error">{fieldErrors.transportAllowanceMinor}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="otherAllowances" className="text-xs">Other ({currency})</Label>
                <Input
                  id="otherAllowances"
                  name="otherAllowances"
                  type="number"
                  step={amountStep}
                  min="0"
                  defaultValue={otherAED}
                  placeholder={amountPlaceholder}
                  aria-invalid={!!fieldErrors.otherAllowancesMinor}
                />
                {fieldErrors.otherAllowancesMinor && <p className="field-error">{fieldErrors.otherAllowancesMinor}</p>}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">UAE WPS Banking Details</h4>
              <p className="text-xs text-muted-foreground">
                Used when generating Central Bank / MOHRE Wage Protection System (.SIF) files.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="molPersonId" className="text-xs">MOL / Labour Card ID (14 digits)</Label>
                <Input
                  id="molPersonId"
                  name="molPersonId"
                  defaultValue={employee?.molPersonId || ""}
                  placeholder="14-digit Person ID"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankRoutingCode" className="text-xs">Bank Routing Code (9 digits)</Label>
                <Input
                  id="bankRoutingCode"
                  name="bankRoutingCode"
                  defaultValue={employee?.bankRoutingCode || ""}
                  placeholder="e.g. 303100001"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iban" className="text-xs">Employee IBAN (AE + 21 digits)</Label>
                <Input
                  id="iban"
                  name="iban"
                  defaultValue={employee?.iban || ""}
                  placeholder="AE070331234567890123456"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="wpsEnabled"
                name="wpsEnabled"
                defaultChecked={employee ? employee.wpsEnabled : true}
                className="rounded border-border text-primary focus:ring-primary size-4"
              />
              <Label htmlFor="wpsEnabled" className="cursor-pointer text-xs text-muted-foreground">
                Include employee in WPS (.SIF) salary transfers
              </Label>
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
            <Button permission={isEdit ? "edit" : "create"} type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Update Employee" : "Create Employee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
