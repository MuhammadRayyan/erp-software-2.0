"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Play, Search, Eye, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SelectNative } from "@/components/ui/select-native";
import { type PayslipRecord, type EmployeeRecord } from "@/modules/payroll/services/payroll-service";
import { PayRunDialog } from "./pay-run-dialog";

interface PayslipsClientProps {
  businessId: string;
  payslips: PayslipRecord[];
  employees: EmployeeRecord[];
}

export function PayslipsClient({ businessId, payslips, employees }: PayslipsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [payRunOpen, setPayRunOpen] = useState(false);

  const filtered = payslips.filter((p) => {
    if (statusFilter !== "all" && p.documentStatus !== statusFilter) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      p.payslipNumber.toLowerCase().includes(term) ||
      (p.employeeName && p.employeeName.toLowerCase().includes(term)) ||
      (p.periodDescription && p.periodDescription.toLowerCase().includes(term))
    );
  });

  const formatAED = (minor: number) => {
    return `AED ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (status: "draft" | "posted" | "void") => {
    switch (status) {
      case "posted":
        return <Badge tone="success">Posted</Badge>;
      case "draft":
        return <Badge tone="neutral">Draft</Badge>;
      case "void":
        return <Badge tone="danger">Void</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top action and filter bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search payslip #, employee, period..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <SelectNative
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36 h-9 text-xs font-medium"
          >
            <option value="all">All Statuses</option>
            <option value="posted">Posted Only</option>
            <option value="draft">Draft Only</option>
            <option value="void">Void Only</option>
          </SelectNative>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setPayRunOpen(true)}
            className="h-9"
          >
            <Play className="size-3.5 mr-1.5 text-primary" /> Generate Pay Run
          </Button>
          <Button asChild className="h-9">
            <Link href={`/b/${businessId}/payroll/payslips/new`}>
              <Plus className="size-4 mr-1.5" /> New Payslip
            </Link>
          </Button>
        </div>
      </div>

      {/* Payslips Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Payslip #</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Date & Period</th>
                <th className="py-3 px-4 text-right">Gross</th>
                <th className="py-3 px-4 text-right">Deductions</th>
                <th className="py-3 px-4 text-right">Net Pay</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No payslips found. Create your first payslip or click &ldquo;Generate Pay Run&rdquo;.
                  </td>
                </tr>
              ) : (
                filtered.map((slip) => (
                  <tr key={slip.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <Link
                        href={`/b/${businessId}/payroll/payslips/${slip.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {slip.payslipNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">{slip.employeeName || "Employee"}</div>
                      <div className="text-xs text-muted-foreground">
                        {slip.employeeDesignation || slip.employeeDepartment || ""}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-foreground">{slip.date}</div>
                      <div className="text-xs text-muted-foreground">{slip.periodDescription || "-"}</div>
                    </td>
                    <td className="py-3 px-4 text-right text-foreground">
                      {formatAED(slip.grossAmountMinor)}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {slip.deductionsMinor > 0 ? `-${formatAED(slip.deductionsMinor)}` : "-"}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                      {formatAED(slip.netAmountMinor)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getStatusBadge(slip.documentStatus)}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="View details">
                        <Link href={`/b/${businessId}/payroll/payslips/${slip.id}`}>
                          <Eye className="size-3.5" />
                        </Link>
                      </Button>
                      {slip.documentStatus === "draft" && (
                        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit draft">
                          <Link href={`/b/${businessId}/payroll/payslips/${slip.id}/edit`}>
                            <Edit className="size-3.5" />
                          </Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PayRunDialog
        businessId={businessId}
        employees={employees}
        open={payRunOpen}
        onOpenChange={setPayRunOpen}
        onGenerated={() => router.refresh()}
      />
    </div>
  );
}
