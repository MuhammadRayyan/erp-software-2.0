"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import {
  type EmployeeRecord,
  type PayslipItemRecord,
  type PayslipRecord,
  type PayslipLineRecord,
} from "@/modules/payroll/services/payroll-service";
import { savePayslipAction } from "@/modules/payroll/actions/payroll-actions";

interface LineFormState {
  id?: string;
  itemId?: string;
  type: "earnings" | "deduction";
  description: string;
  accountId: string;
  amount: string; // AED string
}

interface PayslipFormProps {
  businessId: string;
  employees: EmployeeRecord[];
  items: PayslipItemRecord[];
  accounts: Array<{ id: string; name: string; type: string }>;
  initialPayslip?: PayslipRecord | null;
  initialLines?: PayslipLineRecord[];
  prefill?: {
    employeeId?: string;
    gratuityAED?: string;
    leaveEncashmentAED?: string;
    periodDescription?: string;
  };
}

export function PayslipForm({
  businessId,
  employees,
  items,
  accounts,
  initialPayslip,
  initialLines,
  prefill,
}: PayslipFormProps) {
  const isEdit = Boolean(initialPayslip?.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState<string>(
    initialPayslip?.employeeId || prefill?.employeeId || (employees[0]?.id ?? "")
  );

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date());

  const [date, setDate] = useState<string>(initialPayslip?.date || today);
  const [payslipNumber, setPayslipNumber] = useState<string>(initialPayslip?.payslipNumber || "");
  const [periodDescription, setPeriodDescription] = useState<string>(
    initialPayslip?.periodDescription || prefill?.periodDescription || currentMonth
  );
  const [notes, setNotes] = useState<string>(initialPayslip?.notes || "");

  // Build initial lines with item account mapping
  const defaultAccountForEarnings = items.find((i) => i.type === "earnings")?.accountId || "acct-salaries-expense-6100";
  const defaultAccountForDeductions = items.find((i) => i.type === "deduction")?.accountId || "acct-employee-advances-1220";

  const basicItem = items.find((i) => i.id === "item-basic-salary" || i.name.toLowerCase().includes("basic"));
  const housingItem = items.find((i) => i.id === "item-housing-allowance" || i.name.toLowerCase().includes("housing"));
  const transportItem = items.find((i) => i.id === "item-transport-allowance" || i.name.toLowerCase().includes("transport"));
  const otherItem = items.find((i) => i.id === "item-bonus-commission" || i.name.toLowerCase().includes("other") || i.name.toLowerCase().includes("bonus"));
  const eosbItem = items.find((i) => i.id === "item-eosb-gratuity" || i.name.toLowerCase().includes("gratuity"));

  const getInitialLines = (): LineFormState[] => {
    if (initialLines && initialLines.length > 0) {
      return initialLines.map((l) => ({
        id: l.id,
        itemId: l.itemId || undefined,
        type: l.type,
        description: l.description,
        accountId: l.accountId,
        amount: (l.amountMinor / 100).toFixed(2),
      }));
    }

    // Check prefill from EOSB calculator
    if (prefill?.employeeId) {
      const selectedEmp = employees.find((e) => e.id === prefill.employeeId);
      const prefillLines: LineFormState[] = [];

      if (selectedEmp?.basicSalaryMinor && selectedEmp.basicSalaryMinor > 0) {
        prefillLines.push({
          itemId: basicItem?.id || "item-basic-salary",
          type: "earnings",
          description: "Basic Salary (Final Month)",
          accountId: basicItem?.accountId || defaultAccountForEarnings,
          amount: (selectedEmp.basicSalaryMinor / 100).toFixed(2),
        });
      }

      if (prefill.gratuityAED && parseFloat(prefill.gratuityAED) > 0) {
        prefillLines.push({
          itemId: eosbItem?.id || "item-eosb-gratuity",
          type: "earnings",
          description: "End of Service Gratuity (UAE Article 51)",
          accountId: eosbItem?.accountId || defaultAccountForEarnings,
          amount: parseFloat(prefill.gratuityAED).toFixed(2),
        });
      }

      if (prefill.leaveEncashmentAED && parseFloat(prefill.leaveEncashmentAED) > 0) {
        prefillLines.push({
          type: "earnings",
          description: "Leave Encashment (UAE Article 29)",
          accountId: defaultAccountForEarnings,
          amount: parseFloat(prefill.leaveEncashmentAED).toFixed(2),
        });
      }

      if (prefillLines.length > 0) return prefillLines;
    }

    // Default: load selected employee's standard salary
    const emp = employees.find((e) => e.id === employeeId);
    const lines: LineFormState[] = [];
    if (emp?.basicSalaryMinor && emp.basicSalaryMinor > 0) {
      lines.push({
        itemId: basicItem?.id || "item-basic-salary",
        type: "earnings",
        description: basicItem?.name || "Basic Salary",
        accountId: basicItem?.accountId || defaultAccountForEarnings,
        amount: (emp.basicSalaryMinor / 100).toFixed(2),
      });
    }
    if (emp?.housingAllowanceMinor && emp.housingAllowanceMinor > 0) {
      lines.push({
        itemId: housingItem?.id || "item-housing-allowance",
        type: "earnings",
        description: housingItem?.name || "Housing Allowance",
        accountId: housingItem?.accountId || defaultAccountForEarnings,
        amount: (emp.housingAllowanceMinor / 100).toFixed(2),
      });
    }
    if (emp?.transportAllowanceMinor && emp.transportAllowanceMinor > 0) {
      lines.push({
        itemId: transportItem?.id || "item-transport-allowance",
        type: "earnings",
        description: transportItem?.name || "Transport Allowance",
        accountId: transportItem?.accountId || defaultAccountForEarnings,
        amount: (emp.transportAllowanceMinor / 100).toFixed(2),
      });
    }
    if (emp?.otherAllowancesMinor && emp.otherAllowancesMinor > 0) {
      lines.push({
        itemId: otherItem?.id || "item-bonus-commission",
        type: "earnings",
        description: otherItem?.name || "Other Allowance",
        accountId: otherItem?.accountId || defaultAccountForEarnings,
        amount: (emp.otherAllowancesMinor / 100).toFixed(2),
      });
    }

    if (lines.length === 0) {
      lines.push({
        itemId: basicItem?.id || "item-basic-salary",
        type: "earnings",
        description: basicItem?.name || "Basic Salary",
        accountId: basicItem?.accountId || defaultAccountForEarnings,
        amount: "0.00",
      });
    }

    return lines;
  };

  const [lines, setLines] = useState<LineFormState[]>(getInitialLines);

  const handleEmployeeChange = (newEmpId: string) => {
    setEmployeeId(newEmpId);
    const emp = employees.find((e) => e.id === newEmpId);
    if (!emp) return;

    // Populate lines if not editing an existing payslip
    if (!isEdit) {
      const newLines: LineFormState[] = [];
      if (emp.basicSalaryMinor && emp.basicSalaryMinor > 0) {
        newLines.push({
          itemId: basicItem?.id || "item-basic-salary",
          type: "earnings",
          description: basicItem?.name || "Basic Salary",
          accountId: basicItem?.accountId || defaultAccountForEarnings,
          amount: (emp.basicSalaryMinor / 100).toFixed(2),
        });
      }
      if (emp.housingAllowanceMinor && emp.housingAllowanceMinor > 0) {
        newLines.push({
          itemId: housingItem?.id || "item-housing-allowance",
          type: "earnings",
          description: housingItem?.name || "Housing Allowance",
          accountId: housingItem?.accountId || defaultAccountForEarnings,
          amount: (emp.housingAllowanceMinor / 100).toFixed(2),
        });
      }
      if (emp.transportAllowanceMinor && emp.transportAllowanceMinor > 0) {
        newLines.push({
          itemId: transportItem?.id || "item-transport-allowance",
          type: "earnings",
          description: transportItem?.name || "Transport Allowance",
          accountId: transportItem?.accountId || defaultAccountForEarnings,
          amount: (emp.transportAllowanceMinor / 100).toFixed(2),
        });
      }
      if (emp.otherAllowancesMinor && emp.otherAllowancesMinor > 0) {
        newLines.push({
          itemId: otherItem?.id || "item-bonus-commission",
          type: "earnings",
          description: otherItem?.name || "Other Allowance",
          accountId: otherItem?.accountId || defaultAccountForEarnings,
          amount: (emp.otherAllowancesMinor / 100).toFixed(2),
        });
      }

      if (newLines.length > 0) {
        setLines(newLines);
      }
    }
  };

  // Add line helper
  const addLine = (type: "earnings" | "deduction") => {
    const defaultAcc = type === "earnings" ? defaultAccountForEarnings : defaultAccountForDeductions;
    const itemMatch = items.find((i) => i.type === type);
    setLines((prev) => [
      ...prev,
      {
        itemId: itemMatch?.id,
        type,
        description: itemMatch?.name || (type === "earnings" ? "Allowance" : "Deduction"),
        accountId: itemMatch?.accountId || defaultAcc,
        amount: "0.00",
      },
    ]);
  };

  // Remove line helper
  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Update line field helper
  const updateLine = (index: number, patch: Partial<LineFormState>) => {
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== index) return line;
        const updated = { ...line, ...patch };

        // If item selection changed, update description and account
        if (patch.itemId && patch.itemId !== line.itemId) {
          const matchedItem = items.find((i) => i.id === patch.itemId);
          if (matchedItem) {
            updated.description = matchedItem.name;
            updated.accountId = matchedItem.accountId;
          }
        }
        return updated;
      })
    );
  };

  // Live Totals calculation
  const grossTotal = lines
    .filter((l) => l.type === "earnings")
    .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  const deductionsTotal = lines
    .filter((l) => l.type === "deduction")
    .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

  const netPay = grossTotal - deductionsTotal;

  const handleSubmit = async (autoPost: boolean) => {
    setError(null);

    if (!employeeId) {
      setError("Please select an employee.");
      return;
    }

    if (lines.length === 0) {
      setError("Please add at least one earnings line.");
      return;
    }

    if (netPay < 0) {
      setError("Total deductions cannot exceed gross earnings.");
      return;
    }

    setLoading(true);

    const payload = {
      id: initialPayslip?.id,
      payslipNumber: payslipNumber.trim() || undefined,
      employeeId,
      date,
      periodDescription: periodDescription.trim() || null,
      notes: notes.trim() || null,
      autoPost,
      lines: lines.map((l, pos) => ({
        id: l.id,
        itemId: l.itemId || null,
        type: l.type,
        description: l.description.trim() || (l.type === "earnings" ? "Earnings" : "Deduction"),
        accountId: l.accountId,
        amountMinor: Math.round((parseFloat(l.amount) || 0) * 100),
        position: pos + 1,
      })),
    };

    try {
      const res = await savePayslipAction(businessId, payload);
      if (res?.error) {
        setError(res.error);
        toast.error(res.error);
        setLoading(false);
        return;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save payslip.";
      // Next.js redirect throws a NEXT_REDIRECT error which is caught as success navigation
      if (typeof msg === "string" && msg.includes("NEXT_REDIRECT")) {
        return;
      }
      setError(msg);
      toast.error(msg);
      setLoading(false);
    }
  };

  const earningsLines = lines
    .map((line, originalIndex) => ({ line, originalIndex }))
    .filter(({ line }) => line.type === "earnings");

  const deductionLines = lines
    .map((line, originalIndex) => ({ line, originalIndex }))
    .filter(({ line }) => line.type === "deduction");

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 text-sm rounded bg-danger/10 border border-danger/30 text-danger">
          {error}
        </div>
      )}

      {/* Header Form Card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Payslip Details
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="employeeId">Employee *</Label>
            <SelectNative
              id="employeeId"
              value={employeeId}
              onChange={(e) => handleEmployeeChange(e.target.value)}
              disabled={isEdit}
              required
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.code ? `(${emp.code})` : ""} {emp.designation ? `- ${emp.designation}` : ""}
                </option>
              ))}
            </SelectNative>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Payslip Date *</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="periodDescription">Period Description</Label>
            <Input
              id="periodDescription"
              value={periodDescription}
              onChange={(e) => setPeriodDescription(e.target.value)}
              placeholder="e.g. October 2026"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="payslipNumber">Payslip # (leave empty for auto-sequence)</Label>
            <Input
              id="payslipNumber"
              value={payslipNumber}
              onChange={(e) => setPayslipNumber(e.target.value)}
              placeholder="e.g. PS-0001"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes / Memo</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional remarks or notes"
            />
          </div>
        </div>
      </div>

      {/* Earnings Table Card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Earnings & Allowances
            </h3>
            <p className="text-xs text-muted-foreground">Add salary items, allowances, overtime, or severance.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => addLine("earnings")}
            className="h-8 text-xs"
          >
            <Plus className="size-3.5 mr-1" /> Add Earnings
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th className="py-2.5 px-3 w-1/4">Predefined Item</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 w-1/4">GL Account</th>
                <th className="py-2.5 px-3 w-32 text-right">Amount (AED)</th>
                <th className="py-2.5 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {earningsLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                    No earnings lines added.
                  </td>
                </tr>
              ) : (
                earningsLines.map(({ line, originalIndex }) => (
                  <tr key={originalIndex} className="hover:bg-muted/20">
                    <td className="py-2 px-3">
                      <SelectNative
                        value={line.itemId || ""}
                        onChange={(e) => updateLine(originalIndex, { itemId: e.target.value || undefined })}
                        className="h-8 text-xs"
                      >
                        <option value="">Custom Item</option>
                        {items
                          .filter((i) => i.type === "earnings")
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                      </SelectNative>
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(originalIndex, { description: e.target.value })}
                        placeholder="Description"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <SelectNative
                        value={line.accountId}
                        onChange={(e) => updateLine(originalIndex, { accountId: e.target.value })}
                        className="h-8 text-xs"
                      >
                        {accounts.map((acct) => (
                          <option key={acct.id} value={acct.id}>
                            {acct.name}
                          </option>
                        ))}
                      </SelectNative>
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(originalIndex, { amount: e.target.value })}
                        className="h-8 text-xs text-right font-medium"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(originalIndex)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deductions Table Card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Deductions & Recoveries
            </h3>
            <p className="text-xs text-muted-foreground">Salary advance repayments, unpaid absence, or penalty deductions.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => addLine("deduction")}
            className="h-8 text-xs"
          >
            <Plus className="size-3.5 mr-1" /> Add Deduction
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase">
              <tr>
                <th className="py-2.5 px-3 w-1/4">Predefined Item</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3 w-1/4">GL Account</th>
                <th className="py-2.5 px-3 w-32 text-right">Amount (AED)</th>
                <th className="py-2.5 px-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deductionLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                    No deduction lines added.
                  </td>
                </tr>
              ) : (
                deductionLines.map(({ line, originalIndex }) => (
                  <tr key={originalIndex} className="hover:bg-muted/20">
                    <td className="py-2 px-3">
                      <SelectNative
                        value={line.itemId || ""}
                        onChange={(e) => updateLine(originalIndex, { itemId: e.target.value || undefined })}
                        className="h-8 text-xs"
                      >
                        <option value="">Custom Item</option>
                        {items
                          .filter((i) => i.type === "deduction")
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                            </option>
                          ))}
                      </SelectNative>
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(originalIndex, { description: e.target.value })}
                        placeholder="Description"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <SelectNative
                        value={line.accountId}
                        onChange={(e) => updateLine(originalIndex, { accountId: e.target.value })}
                        className="h-8 text-xs"
                      >
                        {accounts.map((acct) => (
                          <option key={acct.id} value={acct.id}>
                            {acct.name}
                          </option>
                        ))}
                      </SelectNative>
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(originalIndex, { amount: e.target.value })}
                        className="h-8 text-xs text-right font-medium"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(originalIndex)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals Summary Panel */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="text-xs text-muted-foreground">
            Balanced GL Posting: debits salary expense accounts, credits payroll payable & advances.
          </div>

          <div className="space-y-1.5 min-w-[280px]">
            <div className="flex justify-between text-sm text-foreground">
              <span>Gross Earnings:</span>
              <span className="font-medium">
                AED {grossTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total Deductions:</span>
              <span className="font-medium">
                -AED {deductionsTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="pt-2 border-t border-border flex justify-between text-base font-bold text-foreground">
              <span>Net Pay:</span>
              <span className="text-primary text-lg">
                AED {netPay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <Button asChild variant="secondary">
          <Link href={`/b/${businessId}/payroll/payslips`}>Cancel</Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleSubmit(false)}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save as Draft"}
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save & Post to Ledger"}
          </Button>
        </div>
      </div>
    </div>
  );
}
