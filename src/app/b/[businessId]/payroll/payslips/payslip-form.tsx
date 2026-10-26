"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { formatMoney } from "@/core/format";
import { addMinor, minorToInput } from "@/modules/accounting/calculations/money";
import { parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { FormError } from "@/components/form-error";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { useRouter } from "next/navigation";
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
  amount: string; // decimal string
}

interface PayslipFormProps {
  businessId: string;
  employees: EmployeeRecord[];
  items: PayslipItemRecord[];
  accounts: Array<{ id: string; name: string; type: string }>;
  currency?: string;
  currencyMinorUnit?: number;
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
  currency = "AED",
  currencyMinorUnit = 2,
  initialPayslip,
  initialLines,
  prefill,
}: PayslipFormProps) {
  const isEdit = Boolean(initialPayslip?.id);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
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
        amount: minorToInput(l.amountMinor, currencyMinorUnit),
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

  function previewMinor(value: string) {
    try { return parseCurrencyAmountToMinor(value || "0", currencyMinorUnit); } catch { return 0; }
  }
  const grossTotal = addMinor(lines.filter(line => line.type === "earnings").map(line => previewMinor(line.amount)));
  const deductionsTotal = addMinor(lines.filter(line => line.type === "deduction").map(line => previewMinor(line.amount)));
  const netPay = addMinor([grossTotal, -deductionsTotal]);

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

    try {
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
        amountMinor: parseCurrencyAmountToMinor(l.amount, currencyMinorUnit, `Line ${pos + 1} amount`),
        position: pos + 1,
      })),
    };

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
      <FormError message={error} />

      {/* Header Form Card */}
      <div className="rounded-lg border border-border bg-surface-raised p-5 space-y-4">
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
      <div className="rounded-lg border border-border bg-surface-raised p-5 space-y-4">
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

        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <table className="line-item-table w-full">
            <thead>
              <tr>
                <th className="w-[26%] min-w-[160px]">Predefined Item</th>
                <th className="min-w-[160px]">Description</th>
                <th className="w-[26%] min-w-[160px]">GL Account</th>
                <th className="w-32 min-w-[110px] col-numeric text-right!">Amount ({currency})</th>
                <th className="w-10 text-center"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {earningsLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                    No earnings lines added. Click &ldquo;Add Earnings&rdquo; to insert a compensation line.
                  </td>
                </tr>
              ) : (
                earningsLines.map(({ line, originalIndex }) => (
                  <tr key={originalIndex}>
                    <td>
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
                    <td>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(originalIndex, { description: e.target.value })}
                        placeholder="Description"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td>
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
                    <td>
                      <Input
                        type="number"
                        step={1 / 10 ** currencyMinorUnit}
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(originalIndex, { amount: e.target.value })}
                        className="money h-8 text-xs text-right font-medium"
                      />
                    </td>
                    <td className="text-center align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(originalIndex)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-danger hover:bg-danger/10"
                        title="Remove line"
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
      <div className="rounded-lg border border-border bg-surface-raised p-5 space-y-4">
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

        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <table className="line-item-table w-full">
            <thead>
              <tr>
                <th className="w-[26%] min-w-[160px]">Predefined Item</th>
                <th className="min-w-[160px]">Description</th>
                <th className="w-[26%] min-w-[160px]">GL Account</th>
                <th className="w-32 min-w-[110px] col-numeric text-right!">Amount ({currency})</th>
                <th className="w-10 text-center"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {deductionLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                    No deduction lines added. Click &ldquo;Add Deduction&rdquo; to insert a deduction line.
                  </td>
                </tr>
              ) : (
                deductionLines.map(({ line, originalIndex }) => (
                  <tr key={originalIndex}>
                    <td>
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
                    <td>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(originalIndex, { description: e.target.value })}
                        placeholder="Description"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td>
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
                    <td>
                      <Input
                        type="number"
                        step={1 / 10 ** currencyMinorUnit}
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(originalIndex, { amount: e.target.value })}
                        className="money h-8 text-xs text-right font-medium"
                      />
                    </td>
                    <td className="text-center align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLine(originalIndex)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-danger hover:bg-danger/10"
                        title="Remove line"
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
      <div className="rounded-lg border border-border bg-surface-raised p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="text-xs text-muted-foreground">
            Balanced GL Posting: debits salary expense accounts, credits payroll payable & advances.
          </div>

          <div className="space-y-1.5 min-w-[280px]">
            <div className="flex justify-between text-sm text-foreground">
              <span>Gross Earnings:</span>
              <span className="font-medium money">
                {formatMoney(grossTotal, currency, currencyMinorUnit)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total Deductions:</span>
              <span className="font-medium money">
                {deductionsTotal > 0 ? `-${formatMoney(deductionsTotal, currency, currencyMinorUnit)}` : formatMoney(0, currency, currencyMinorUnit)}
              </span>
            </div>
            <div className="pt-2 border-t border-border flex justify-between text-base font-bold text-foreground">
              <span>Net Pay:</span>
              <span className="text-primary text-lg money font-black">
                {formatMoney(netPay, currency, currencyMinorUnit)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <DocumentFormFooter onCancel={() => router.push(`/b/${businessId}/payroll/payslips`)} status="draft">
        <div className="flex items-center gap-2">
          <Button permission={"save"}
            type="button"
            variant="secondary"
            onClick={() => handleSubmit(false)}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save as Draft"}
          </Button>
          <Button permission={["save", "post"]}
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save & Post to Ledger"}
          </Button>
        </div>
      </DocumentFormFooter>
    </div>
  );
}
