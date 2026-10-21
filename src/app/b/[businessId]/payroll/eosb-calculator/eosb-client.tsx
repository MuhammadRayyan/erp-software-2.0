"use client";

import { useState } from "react";
import Link from "next/link";
import { Calculator, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import { Badge } from "@/components/ui/badge";
import { formatMoney, minorToDecimalString } from "@/core/format";
import { DensityToggle } from "@/components/density-toggle";
import { useTableDensity } from "@/components/use-table-density";
import { type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { calculateUaeEosb, type EosbCalculationResult } from "@/modules/payroll/services/eosb-calculator";

interface EosbClientProps {
  businessId: string;
  employees: EmployeeRecord[];
}

export function EosbClient({ businessId, employees }: EosbClientProps) {
  const { density } = useTableDensity(businessId);
  const today = new Date().toISOString().slice(0, 10);

  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [joiningDate, setJoiningDate] = useState<string>("");
  const [terminationDate, setTerminationDate] = useState<string>(today);
  const [basicSalaryAED, setBasicSalaryAED] = useState<string>("");
  const [unpaidLeaveDays, setUnpaidLeaveDays] = useState<string>("0");
  const [unusedLeaveDays, setUnusedLeaveDays] = useState<string>("0");

  const [calculation, setCalculation] = useState<EosbCalculationResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const handleEmployeeSelect = (empId: string) => {
    setSelectedEmpId(empId);
    if (!empId) return;

    const emp = employees.find((e) => e.id === empId);
    if (emp) {
      if (emp.joiningDate) setJoiningDate(emp.joiningDate);
      if (emp.basicSalaryMinor) setBasicSalaryAED(minorToDecimalString(emp.basicSalaryMinor, "AED"));
    }
  };

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    setCalcError(null);

    if (!joiningDate || !terminationDate) {
      setCalcError("Please enter both joining date and termination date.");
      return;
    }

    const basicMinor = Math.round((parseFloat(basicSalaryAED) || 0) * 100);
    if (basicMinor <= 0) {
      setCalcError("Please enter a valid basic salary amount greater than zero.");
      return;
    }

    try {
      const result = calculateUaeEosb({
        joiningDate,
        terminationDate,
        basicSalaryMinor: basicMinor,
        unpaidLeaveDays: parseInt(unpaidLeaveDays) || 0,
        unusedLeaveDays: parseInt(unusedLeaveDays) || 0,
      });
      setCalculation(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Calculation failed.";
      setCalcError(msg);
      setCalculation(null);
    }
  };

  const getFinalPayslipUrl = () => {
    if (!calculation) return "#";
    const params = new URLSearchParams();
    if (selectedEmpId) params.set("employeeId", selectedEmpId);
    params.set("gratuityAED", minorToDecimalString(calculation.gratuityMinor, "AED"));
    if (calculation.leaveEncashmentMinor > 0) {
      params.set("leaveEncashmentAED", minorToDecimalString(calculation.leaveEncashmentMinor, "AED"));
    }
    params.set("periodDescription", `Final Settlement (${calculation.durationSummary.years} yrs service)`);
    return `/b/${businessId}/payroll/payslips/new?${params.toString()}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Calculation Parameters Form */}
      <div className="lg:col-span-5 rounded-lg border border-border bg-surface-raised p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Calculator className="size-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Calculation Parameters</h3>
            <p className="text-xs text-muted-foreground">UAE Federal Decree-Law No. 33 of 2021</p>
          </div>
        </div>

        {calcError && (
          <div className="p-3 text-xs rounded bg-danger/10 border border-danger/30 text-danger flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div>{calcError}</div>
          </div>
        )}

        <form onSubmit={handleCalculate} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="employee">Select Employee (Optional pre-fill)</Label>
            <SelectNative
              id="employee"
              value={selectedEmpId}
              onChange={(e) => handleEmployeeSelect(e.target.value)}
              className="text-xs"
            >
              <option value="">-- Choose employee to auto-fill --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} {e.code ? `(${e.code})` : ""}
                </option>
              ))}
            </SelectNative>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="joiningDate" className="text-xs">Joining Date *</Label>
              <Input
                id="joiningDate"
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                required
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="terminationDate" className="text-xs">Last Working Day *</Label>
              <Input
                id="terminationDate"
                type="date"
                value={terminationDate}
                onChange={(e) => setTerminationDate(e.target.value)}
                required
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="basicSalary" className="text-xs">Last Monthly Basic Salary (AED) *</Label>
            <Input
              id="basicSalary"
              type="number"
              step="0.01"
              min="0"
              value={basicSalaryAED}
              onChange={(e) => setBasicSalaryAED(e.target.value)}
              placeholder="e.g. 10000.00"
              required
              className="h-8 text-xs font-medium"
            />
            <p className="text-[11px] text-muted-foreground">
              Article 51 is strictly calculated on basic wage only (excluding allowances).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="unpaidLeave" className="text-xs">Unpaid Leave Days</Label>
              <Input
                id="unpaidLeave"
                type="number"
                min="0"
                value={unpaidLeaveDays}
                onChange={(e) => setUnpaidLeaveDays(e.target.value)}
                placeholder="0"
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Excluded from service period</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="unusedLeave" className="text-xs">Unused Leave Days</Label>
              <Input
                id="unusedLeave"
                type="number"
                min="0"
                value={unusedLeaveDays}
                onChange={(e) => setUnusedLeaveDays(e.target.value)}
                placeholder="0"
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Article 29 leave encashment</p>
            </div>
          </div>

          <Button type="submit" className="w-full mt-2 h-9">
            Calculate Statutory EOSB
          </Button>
        </form>
      </div>

      {/* Right Column: Statutory Breakdown Card */}
      <div className="lg:col-span-7 space-y-4">
        {calculation ? (
          <div className="rounded-lg border border-border bg-surface-raised p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-start border-b border-border pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Statutory Computation Summary
                </span>
                <h3 className="text-lg font-bold text-foreground mt-0.5">
                  End of Service Settlement
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <DensityToggle businessId={businessId} />
                <Badge tone={calculation.eligibleForGratuity ? "success" : "neutral"} className="text-xs">
                  {calculation.eligibleForGratuity ? "Eligible (1+ Year)" : "Ineligible (<1 Year)"}
                </Badge>
              </div>
            </div>

            {/* Service Duration Details */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs bg-muted/30 p-4 rounded-md border border-border/50">
              <div>
                <span className="text-muted-foreground block">Continuous Service</span>
                <span className="font-semibold text-foreground text-sm">
                  {calculation.durationSummary.formatted}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Net Service Days</span>
                <span className="font-semibold text-foreground text-sm">
                  {calculation.netServiceDays.toLocaleString()} days
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Daily Basic Wage</span>
                <span className="font-semibold text-foreground text-sm">
                  {formatMoney(calculation.dailyWageMinor, "AED")}
                </span>
              </div>
            </div>

            {/* Gratuity Calculation Breakdown Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Article 51 Severance Gratuity & Settlement Breakdown
              </h4>
              <div className="data-panel overflow-hidden">
                <table className="data-table w-full" data-density={density}>
                  <thead>
                    <tr>
                      <th>Tier / Statutory Component</th>
                      <th>Service Basis</th>
                      <th className="col-numeric text-right!">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div className="font-medium text-foreground">First 5 Years (Tier 1)</div>
                        <div className="text-xs text-muted-foreground">
                          Service up to 5 years computed at 21 days&apos; basic wage per year
                        </div>
                      </td>
                      <td className="text-xs text-muted-foreground">
                        21 days / year
                      </td>
                      <td className="money text-right font-medium text-foreground">
                        {formatMoney(calculation.gratuityTier1Minor, "AED")}
                      </td>
                    </tr>

                    {calculation.yearsOfService > 5 && (
                      <tr>
                        <td>
                          <div className="font-medium text-foreground">Additional Service (Tier 2)</div>
                          <div className="text-xs text-muted-foreground">
                            Service exceeding 5 years computed at 30 days&apos; basic wage per year
                          </div>
                        </td>
                        <td className="text-xs text-muted-foreground">
                          30 days / year
                        </td>
                        <td className="money text-right font-medium text-foreground">
                          {formatMoney(calculation.gratuityTier2Minor, "AED")}
                        </td>
                      </tr>
                    )}

                    {calculation.unusedLeaveDays > 0 && (
                      <tr>
                        <td>
                          <div className="font-medium text-foreground">Article 29 Annual Leave Encashment</div>
                          <div className="text-xs text-muted-foreground">
                            {calculation.unusedLeaveDays} days unused leave balance
                          </div>
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {calculation.unusedLeaveDays} days × {formatMoney(calculation.dailyWageMinor, "AED")}
                        </td>
                        <td className="money text-right font-medium text-foreground">
                          {formatMoney(calculation.leaveEncashmentMinor, "AED")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface font-semibold">
                      <td colSpan={2} className="text-foreground">
                        Total Statutory Gratuity
                        {calculation.isCapped && (
                          <span className="text-xs text-danger ml-2 font-normal">
                            (Capped at 24 months basic salary: {formatMoney(calculation.maxCapMinor, "AED")})
                          </span>
                        )}
                      </td>
                      <td className="money text-right font-bold text-foreground">
                        {formatMoney(calculation.gratuityMinor, "AED")}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Total Settlement Box */}
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="text-xs font-semibold text-primary uppercase tracking-wide">
                  Total Final Settlement Amount
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  End of Service Gratuity + Leave Encashment
                </div>
              </div>
              <div className="text-2xl font-black text-primary">
                {formatMoney(calculation.totalSettlementMinor, "AED")}
              </div>
            </div>

            {/* One-click Action to Create Final Payslip */}
            <div className="pt-2 flex justify-end">
              <Button asChild className="h-10">
                <Link href={getFinalPayslipUrl()}>
                  <span>Create Final Payslip with Gratuity</span>
                  <ArrowRight className="size-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center space-y-3">
            <ShieldCheck className="size-10 text-muted-foreground mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">UAE Labor Law Compliance Engine</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Enter employee joining and end dates on the left to compute Article 51 Severance Gratuity and Article 29 Leave Encashment with zero manual guesswork.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
