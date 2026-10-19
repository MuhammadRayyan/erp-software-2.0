import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { getPayslipWithLines } from "@/modules/payroll/services/payroll-service";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";
import { PayslipActionsBar } from "./payslip-actions-bar";

export const metadata = {
  title: "Payslip Details - Payroll",
};

export default async function PayslipDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; payslipId: string }>;
}) {
  const { businessId, payslipId } = await params;
  const { user } = await requireModule(businessId, "payroll");

  const record = getPayslipWithLines(businessId, user.id, payslipId);
  if (!record) notFound();

  const { payslip, employee, lines } = record;
  const profile = getBusinessProfile(businessId, user.id);

  const earnings = lines.filter((l) => l.type === "earnings");
  const deductions = lines.filter((l) => l.type === "deduction");

  const formatAED = (minor: number) => {
    return `AED ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="page-container space-y-6 max-w-4xl">
      {/* Navigation / Back link */}
      <div className="print:hidden">
        <Link
          href={`/b/${businessId}/payroll/payslips`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4 mr-1.5" /> Back to Payslips
        </Link>
      </div>

      {/* Top action bar */}
      <PayslipActionsBar
        businessId={businessId}
        payslipId={payslip.id}
        status={payslip.documentStatus}
        journalEntryId={payslip.journalEntryId}
      />

      {/* Printable Payslip Card */}
      <div className="rounded-lg border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {profile?.tradingName || profile?.legalName || "Ledgerly Business"}
            </h1>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {profile?.addressLine1 && <div>{profile.addressLine1}</div>}
              {(profile?.city || profile?.country) && (
                <div>{[profile.city, profile.country].filter(Boolean).join(", ")}</div>
              )}
              {profile?.taxId && <div>TRN: {profile.taxId}</div>}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <h2 className="text-2xl font-black text-primary uppercase tracking-wide">
              PAYSLIP
            </h2>
            <div className="text-sm font-semibold text-foreground mt-1">
              {payslip.payslipNumber}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Issue Date: {payslip.date}
            </div>
            {payslip.periodDescription && (
              <div className="text-xs font-medium text-foreground mt-0.5">
                Pay Period: {payslip.periodDescription}
              </div>
            )}
          </div>
        </div>

        {/* Employee Info Grid */}
        <div className="rounded-md bg-muted/30 p-4 border border-border/60">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground block">Employee Name</span>
              <span className="font-semibold text-foreground text-sm">{employee.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Employee ID</span>
              <span className="font-medium text-foreground">{employee.code || "-"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Designation</span>
              <span className="font-medium text-foreground">{employee.designation || "-"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Department</span>
              <span className="font-medium text-foreground">{employee.department || "-"}</span>
            </div>
          </div>
        </div>

        {/* Earnings & Deductions Tables */}
        <div className="space-y-6">
          {/* Earnings Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Earnings & Allowances
            </h3>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border font-semibold text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Amount (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {earnings.length > 0 ? (
                    earnings.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2.5 px-3 font-medium text-foreground">{e.description}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-foreground">
                          {formatAED(e.amountMinor)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-foreground">Salary / Compensation</td>
                      <td className="py-2.5 px-3 text-right font-medium text-foreground">
                        {formatAED(payslip.grossAmountMinor)}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-muted/10 font-bold border-t border-border">
                    <td className="py-2 px-3 text-foreground">Total Gross Earnings</td>
                    <td className="py-2 px-3 text-right text-foreground">
                      {formatAED(payslip.grossAmountMinor)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Deductions Section */}
          {deductions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Deductions & Recoveries
              </h3>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border font-semibold text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Amount (AED)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {deductions.map((d) => (
                      <tr key={d.id}>
                        <td className="py-2.5 px-3 font-medium text-foreground">{d.description}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-muted-foreground">
                          -{formatAED(d.amountMinor)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/10 font-bold border-t border-border">
                      <td className="py-2 px-3 text-foreground">Total Deductions</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        -{formatAED(payslip.deductionsMinor)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Net Salary Payable Box */}
        <div className="rounded-md bg-muted/40 border border-border p-4 flex justify-between items-center">
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground">Net Salary Payable</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Credited to Employee / Payroll Payable
            </div>
          </div>
          <div className="text-2xl font-black text-primary">
            {formatAED(payslip.netAmountMinor)}
          </div>
        </div>

        {/* Notes if any */}
        {payslip.notes && (
          <div className="text-xs text-muted-foreground pt-2">
            <span className="font-semibold text-foreground">Notes: </span>
            {payslip.notes}
          </div>
        )}

        {/* Signatures / Acknowledgement Block */}
        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-border text-xs">
          <div className="space-y-6">
            <div className="text-muted-foreground">Employer / Authorized Signature:</div>
            <div className="border-b border-dashed border-border-strong w-48"></div>
          </div>
          <div className="space-y-6 text-right sm:text-left">
            <div className="text-muted-foreground">Employee Signature & Date:</div>
            <div className="border-b border-dashed border-border-strong w-48 ml-auto sm:ml-0"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
