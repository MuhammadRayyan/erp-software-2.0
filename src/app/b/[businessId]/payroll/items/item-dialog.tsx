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
import { SelectNative } from "@/components/ui/select-native";
import { FormError } from "@/components/form-error";
import { type PayslipItemRecord } from "@/modules/payroll/services/payroll-service";
import { savePayslipItemAction } from "@/modules/payroll/actions/payroll-actions";

interface ItemDialogProps {
  businessId: string;
  item?: PayslipItemRecord | null;
  accounts: Array<{ id: string; name: string; type: string; subtype: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ItemDialog({
  businessId,
  item,
  accounts,
  open,
  onOpenChange,
  onSaved,
}: ItemDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const isEdit = Boolean(item?.id);

  useEffect(() => {
    if (open) {
      setError(null);
      setFieldErrors({});
    }
  }, [open, item?.id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    const trimmedName = formData.get("name")?.toString().trim() || "";
    const accountId = formData.get("accountId")?.toString().trim() || "";
    const nextFieldErrors: Record<string, string> = {};
    if (!trimmedName) nextFieldErrors.name = "Item name is required.";
    if (!accountId) nextFieldErrors.accountId = "Chart of accounts mapping is required.";
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setLoading(true);
    const payload = {
      id: item?.id,
      name: trimmedName,
      type: formData.get("type")?.toString() as "earnings" | "deduction",
      accountId,
      description: formData.get("description")?.toString().trim() || null,
      isActive: formData.get("isActive") === "on",
    };

    try {
      const res = await savePayslipItemAction(businessId, payload);
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
        toast.success(isEdit ? "Payslip item updated" : "Payslip item created");
        onOpenChange(false);
        onSaved?.();
      }
    } catch {
      setError("An unexpected error occurred.");
      toast.error("Failed to save payslip item.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{isEdit ? "Edit Payslip Item" : "New Payslip Item"}</DialogTitle>
        <DialogDescription>
          Predefined earnings or deductions linked to your General Ledger Chart of Accounts.
        </DialogDescription>

        {error && (
          <div className="mt-3">
            <FormError message={error} />
          </div>
        )}

        <form key={`${item?.id ?? "new"}-${open}`} onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="name">Item Name *</Label>
            <Input
              id="name"
              name="name"
              defaultValue={item?.name || ""}
              placeholder="e.g. Health Insurance Allowance"
              required
              aria-invalid={!!fieldErrors.name}
              onChange={() => fieldErrors.name && setFieldErrors((p) => { const n = { ...p }; delete n.name; return n; })}
            />
            {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="type">Item Type *</Label>
              <SelectNative
                id="type"
                name="type"
                defaultValue={item?.type || "earnings"}
                required
              >
                <option value="earnings">Earnings (Addition)</option>
                <option value="deduction">Deduction (Subtraction)</option>
              </SelectNative>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="accountId">GL Account *</Label>
              <SelectNative
                id="accountId"
                name="accountId"
                defaultValue={item?.accountId || "acct-salaries-expense-6100"}
                required
                aria-invalid={!!fieldErrors.accountId}
              >
                {accounts.map((acct) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.name} ({acct.type})
                  </option>
                ))}
              </SelectNative>
              {fieldErrors.accountId && <p className="field-error">{fieldErrors.accountId}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Default Description / Note</Label>
            <Input
              id="description"
              name="description"
              defaultValue={item?.description || ""}
              placeholder="Optional notes shown on payslip line"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              name="isActive"
              defaultChecked={item ? item.isActive : true}
              className="rounded border-border text-primary focus:ring-primary size-4"
            />
            <Label htmlFor="isActive" className="cursor-pointer text-sm">
              Active item (visible when generating payslips)
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
              {loading ? "Saving..." : isEdit ? "Update Item" : "Create Item"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
