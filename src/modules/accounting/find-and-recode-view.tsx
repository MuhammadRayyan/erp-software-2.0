"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  Layers,
  Lock,
  Percent,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useActionPermission } from "@/components/permissions-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney, formatDate } from "@/core/format";
import { recodeLinesAction } from "./actions";
import type {
  FindLinesFilters,
  RecodableLine,
  RecodableSourceType,
} from "./services/find-and-recode-service";

type OptionItem = { id: string; name: string };
type AccountOption = OptionItem & { type: string; subtype: string };
type ProjectOption = OptionItem & { code: string };
type TaxCodeOption = OptionItem & { rate_basis_points: number };

type Props = {
  businessId: string;
  initialLines: RecodableLine[];
  initialFilters: FindLinesFilters;
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  projects: ProjectOption[];
  currency: string;
};

function formatCurrencyTotals(
  lines: readonly RecodableLine[],
  pickMinor: (line: RecodableLine) => number,
  fallbackCurrency: string,
): string {
  if (lines.length === 0) return formatMoney(0, fallbackCurrency);
  const byCurrency = new Map<string, number>();
  for (const line of lines) {
    const code = line.currencyCode || fallbackCurrency;
    byCurrency.set(code, (byCurrency.get(code) ?? 0) + pickMinor(line));
  }
  return Array.from(byCurrency.entries())
    .map(([code, minor]) => formatMoney(minor, code))
    .join(" · ");
}

export function FindAndRecodeView({
  businessId,
  initialLines,
  initialFilters,
  accounts,
  taxCodes,
  projects,
  currency,
}: Props) {
  const router = useRouter();
  const canPost = useActionPermission("post");
  const [isPending, startTransition] = useTransition();

  // Search filter state
  const [sourceType, setSourceType] = useState<string>(initialFilters.sourceType ?? "all");
  const [accountId, setAccountId] = useState<string>(initialFilters.accountId ?? "");
  const [taxCodeId, setTaxCodeId] = useState<string>(initialFilters.taxCodeId ?? "");
  const [projectId, setProjectId] = useState<string>(initialFilters.projectId ?? "");
  const [dateFrom, setDateFrom] = useState<string>(initialFilters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState<string>(initialFilters.dateTo ?? "");
  const [query, setQuery] = useState<string>(initialFilters.query ?? "");

  // Selection state (keyed by `${sourceType}:${sourceId}:${lineId}`)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Modal states
  const [modalType, setModalType] = useState<"account" | "project" | "taxCode" | null>(null);
  const [targetAccount, setTargetAccount] = useState<string>("");
  const [targetProject, setTargetProject] = useState<string>("");
  const [targetTaxCode, setTargetTaxCode] = useState<string>("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const getLineKey = (line: RecodableLine) => `${line.sourceType}:${line.sourceId}:${line.lineId}`;

  const unlockedLines = initialLines.filter((l) => !l.isLocked);
  const allSelected =
    unlockedLines.length > 0 &&
    unlockedLines.every((l) => selectedKeys.has(getLineKey(l)));

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      const next = new Set<string>();
      unlockedLines.forEach((l) => next.add(getLineKey(l)));
      setSelectedKeys(next);
    }
  };

  const handleToggleLine = (line: RecodableLine) => {
    if (!canPost || line.isLocked) return;
    const key = getLineKey(line);
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedKeys(next);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (sourceType && sourceType !== "all") params.set("sourceType", sourceType);
    if (accountId) params.set("accountId", accountId);
    if (taxCodeId) params.set("taxCodeId", taxCodeId);
    if (projectId) params.set("projectId", projectId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (query.trim()) params.set("query", query.trim());

    setSelectedKeys(new Set());
    setActionSuccess(null);
    router.push(`/b/${businessId}/accounting/find-and-recode?${params.toString()}`);
  };

  const handleReset = () => {
    setSourceType("all");
    setAccountId("");
    setTaxCodeId("");
    setProjectId("");
    setDateFrom("");
    setDateTo("");
    setQuery("");
    setSelectedKeys(new Set());
    setActionSuccess(null);
    router.push(`/b/${businessId}/accounting/find-and-recode`);
  };

  // Compute selected lines summary
  const selectedLines = initialLines.filter((l) => selectedKeys.has(getLineKey(l)));
  const selectedNetSummary = formatCurrencyTotals(selectedLines, (l) => l.netAmountMinor, currency);

  const handleExecuteRecode = () => {
    setModalError(null);
    if (selectedLines.length === 0) {
      setModalError("No lines selected.");
      return;
    }

    let action: any;
    if (modalType === "account") {
      if (!targetAccount) {
        setModalError("Please choose a target account.");
        return;
      }
      action = { type: "account", targetAccountId: targetAccount };
    } else if (modalType === "project") {
      action = { type: "project", targetProjectId: targetProject || null };
    } else if (modalType === "taxCode") {
      if (!targetTaxCode) {
        setModalError("Please choose a target tax code.");
        return;
      }
      action = { type: "taxCode", targetTaxCodeId: targetTaxCode };
    }

    startTransition(async () => {
      const payload = {
        lines: selectedLines.map((l) => ({
          lineId: l.lineId,
          sourceType: l.sourceType,
          sourceId: l.sourceId,
        })),
        action,
      };

      const res = await recodeLinesAction(businessId, payload);
      if (res.error) {
        setModalError(res.error);
      } else {
        setActionSuccess(res.message ?? "Transactions successfully recoded.");
        setSelectedKeys(new Set());
        setModalType(null);
        router.refresh();
      }
    });
  };

  const getSourceBadge = (type: RecodableSourceType) => {
    switch (type) {
      case "sales_invoice":
        return <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">Sales Invoice</span>;
      case "purchase_invoice":
        return <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">Purchase Bill</span>;
      case "bank_transaction":
        return <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">Bank Entry</span>;
      case "manual_journal":
        return <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">Manual Journal</span>;
    }
  };

  const getSourceLink = (line: RecodableLine) => {
    switch (line.sourceType) {
      case "sales_invoice":
        return `/b/${businessId}/sales/invoices/${line.sourceId}`;
      case "purchase_invoice":
        return `/b/${businessId}/purchases/invoices/${line.sourceId}`;
      case "bank_transaction":
        return `/b/${businessId}/banking/transactions/${line.sourceId}`;
      case "manual_journal":
        return `/b/${businessId}/accounting/journal/${line.sourceId}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert / Success */}
      {actionSuccess && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium">{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Filter / Search Bar Panel */}
      <form
        onSubmit={handleSearch}
        className="rounded-xl border border-border bg-surface p-4 shadow-2xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Find Transactions to Recode</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Search lines across invoices, bills, bank transactions, and journals
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Source Type Filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Source Type</label>
            <Combobox
              size="sm"
              ariaLabel="Source Type"
              searchable={false}
              value={sourceType}
              onValueChange={setSourceType}
              options={[
                { value: "all", label: "All Sources" },
                { value: "sales_invoice", label: "Sales Invoices" },
                { value: "purchase_invoice", label: "Purchase Invoices" },
                { value: "bank_transaction", label: "Bank Transactions" },
                { value: "manual_journal", label: "Manual Journals" },
              ]}
            />
          </div>

          {/* Account Filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Current Account</label>
            <Combobox
              size="sm"
              ariaLabel="Current Account"
              options={accounts.map((acc) => ({
                value: acc.id,
                label: `${acc.name} (${acc.type})`,
              }))}
              value={accountId}
              onValueChange={setAccountId}
              allowClear
              clearLabel="Any Account"
              placeholder="Any Account"
              searchPlaceholder="Search accounts…"
              emptyText="No accounts found."
            />
          </div>

          {/* Tax Code Filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Current Tax Code</label>
            <Combobox
              size="sm"
              ariaLabel="Current Tax Code"
              options={taxCodes.map((tc) => ({
                value: tc.id,
                label: `${tc.name} (${tc.rate_basis_points / 100}%)`,
              }))}
              value={taxCodeId}
              onValueChange={setTaxCodeId}
              allowClear
              clearLabel="Any Tax Code"
              placeholder="Any Tax Code"
              searchPlaceholder="Search tax codes…"
              emptyText="No tax codes found."
            />
          </div>

          {/* Project Filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Current Project</label>
            <Combobox
              size="sm"
              ariaLabel="Current Project"
              options={[
                { value: "none", label: "No Project Assigned" },
                ...projects.map((p) => ({
                  value: p.id,
                  label: `${p.code} - ${p.name}`,
                })),
              ]}
              value={projectId}
              onValueChange={setProjectId}
              allowClear
              clearLabel="Any Project"
              placeholder="Any Project"
              searchPlaceholder="Search projects…"
              emptyText="No projects found."
            />
          </div>

          {/* Date From */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
            </input>
          </div>

          {/* Date To */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
            </input>
          </div>

          {/* Search Query */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Search Query</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search description, document number, or contact name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full rounded-md border border-border-strong bg-surface-raised pr-3 pl-8 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" onClick={handleReset} size="sm">
            Reset Filters
          </Button>
          <Button type="submit" size="sm">
            <Search className="mr-1.5 size-3.5" />
            Find Matching Lines
          </Button>
        </div>
      </form>

      {/* Floating / Sticky Recode Action Bar when lines are selected */}
      {canPost && selectedLines.length > 0 && (
        <div className="sticky top-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 shadow-md backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {selectedLines.length}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {selectedLines.length} line{selectedLines.length === 1 ? "" : "s"} selected
            </span>
            <span className="text-xs text-muted-foreground">
              Total Net: <span className="font-mono font-bold text-foreground">{selectedNetSummary}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              permission="post"
              size="sm"
              variant="secondary"
              onClick={() => {
                setModalError(null);
                setModalType("account");
              }}
            >
              <Layers className="mr-1.5 size-3.5" />
              Recode Account
            </Button>

            <Button
              permission="post"
              size="sm"
              variant="secondary"
              onClick={() => {
                setModalError(null);
                setModalType("taxCode");
              }}
            >
              <Percent className="mr-1.5 size-3.5" />
              Recode Tax Code
            </Button>

            <Button
              permission="post"
              size="sm"
              variant="secondary"
              onClick={() => {
                setModalError(null);
                setModalType("project");
              }}
            >
              <FolderKanban className="mr-1.5 size-3.5" />
              Assign Project
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedKeys(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="data-panel overflow-x-auto">
        {initialLines.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-medium text-foreground">No matching transaction lines found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust your search filters above to query across posted transactions.
            </p>
          </div>
        ) : (
          <table className="data-table min-w-table-2xl">
            <thead>
              <tr>
                {canPost && (
                  <th className="w-10 text-center">
                    <Checkbox
                      checked={
                        allSelected
                          ? true
                          : unlockedLines.length > 0 && selectedKeys.size > 0
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={handleToggleSelectAll}
                      disabled={unlockedLines.length === 0}
                      aria-label="Select all unlocked lines"
                    />
                  </th>
                )}
                <th>Date</th>
                <th>Source</th>
                <th>Doc #</th>
                <th>Contact / Payee</th>
                <th>Description</th>
                <th>Account</th>
                <th>Tax Code</th>
                <th>Project</th>
                <th className="text-right!">Net Amount</th>
                <th className="text-right!">Gross</th>
              </tr>
            </thead>
            <tbody>
              {initialLines.map((line) => {
                const key = getLineKey(line);
                const isChecked = canPost && selectedKeys.has(key);

                return (
                  <tr
                    key={key}
                    onClick={canPost ? () => handleToggleLine(line) : undefined}
                    className={`transition-colors ${canPost ? "cursor-pointer " : ""}${
                      isChecked ? "bg-primary/5" : line.isLocked ? "opacity-60" : "hover:bg-surface-muted"
                    }`}
                  >
                    {canPost && (
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        {line.isLocked ? (
                          <span title="Locked by financial period lock date">
                            <Lock className="mx-auto size-3.5 text-muted-foreground" />
                          </span>
                        ) : (
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => handleToggleLine(line)}
                            aria-label={`Select line ${line.description}`}
                          />
                        )}
                      </td>
                    )}
                    <td className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(line.date)}</td>
                    <td>{getSourceBadge(line.sourceType)}</td>
                    <td>
                      <Link
                        href={getSourceLink(line)}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {line.sourceNumber}
                      </Link>
                    </td>
                    <td className="text-xs font-medium text-foreground">{line.partyName}</td>
                    <td className="max-w-[200px] truncate text-xs text-muted-foreground" title={line.description}>
                      {line.description}
                    </td>
                    <td className="text-xs font-medium">
                      <span>{line.accountName}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground capitalize">({line.accountType})</span>
                    </td>
                    <td className="text-xs text-muted-foreground">{line.taxCodeName || "—"}</td>
                    <td className="text-xs text-muted-foreground">{line.projectName || "—"}</td>
                    <td className="money text-right font-mono text-xs">
                      {formatMoney(line.netAmountMinor, line.currencyCode)}
                    </td>
                    <td className="money text-right font-mono text-xs font-semibold">
                      {formatMoney(line.grossAmountMinor, line.currencyCode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong bg-surface font-semibold text-xs">
                <td colSpan={canPost ? 9 : 8} className="h-10 px-3">
                  Showing {initialLines.length} line{initialLines.length === 1 ? "" : "s"}
                </td>
                <td className="text-right pr-2">
                  Total Gross:
                </td>
                <td className="money text-right font-bold pr-3">
                  {formatCurrencyTotals(initialLines, (l) => l.grossAmountMinor, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Recode Modal */}
      <DialogRoot open={modalType !== null} onOpenChange={(open) => !open && setModalType(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>
            {modalType === "account" && "Recode General Ledger Account"}
            {modalType === "project" && "Assign Project Tag"}
            {modalType === "taxCode" && "Recode Tax Code"}
          </DialogTitle>
          <DialogDescription>
            Reclassify {selectedLines.length} selected transaction line{selectedLines.length === 1 ? "" : "s"}. Underlying double-entry journal entries will be cleanly synchronized.
          </DialogDescription>

          {modalError && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-rose-50 p-2.5 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="size-4 shrink-0 text-rose-600" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {modalType === "account" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Target GL Account</label>
                <Combobox
                  ariaLabel="Target GL Account"
                  options={accounts.map((acc) => ({
                    value: acc.id,
                    label: `${acc.name} — ${acc.type} (${acc.subtype})`,
                  }))}
                  value={targetAccount}
                  onValueChange={setTargetAccount}
                  placeholder="Select target account..."
                  searchPlaceholder="Search GL accounts…"
                  emptyText="No accounts found."
                />
                <p className="text-[11px] text-muted-foreground">
                  The selected account will replace the revenue/expense account on all checked lines.
                </p>
              </div>
            )}

            {modalType === "project" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Target Project</label>
                <Combobox
                  ariaLabel="Target Project"
                  options={projects.map((p) => ({
                    value: p.id,
                    label: `${p.code} - ${p.name}`,
                  }))}
                  value={targetProject}
                  onValueChange={setTargetProject}
                  allowClear
                  clearLabel="Clear Project (Untagged)"
                  placeholder="Clear Project (Untagged)"
                  searchPlaceholder="Search projects…"
                  emptyText="No projects found."
                />
                <p className="text-[11px] text-muted-foreground">
                  Assigning a project updates line reporting across Project Profitability and Job Costing.
                </p>
              </div>
            )}

            {modalType === "taxCode" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Target Tax Code</label>
                <Combobox
                  ariaLabel="Target Tax Code"
                  options={taxCodes.map((tc) => ({
                    value: tc.id,
                    label: `${tc.name} (${tc.rate_basis_points / 100}%)`,
                  }))}
                  value={targetTaxCode}
                  onValueChange={setTargetTaxCode}
                  placeholder="Select tax code..."
                  searchPlaceholder="Search tax codes…"
                  emptyText="No tax codes found."
                />
                <p className="text-[11px] text-muted-foreground">
                  Line tax amounts and output/input VAT ledger entries will be recalculated accordingly.
                </p>
              </div>
            )}

            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-200">
              <span className="font-semibold">Note:</span> This bulk operation runs atomically. If any document is in a locked period or fails validation, no changes will be made.
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="secondary" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button permission="post" onClick={handleExecuteRecode} disabled={isPending}>
              {isPending ? (
                <>
                  <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                  Recoding...
                </>
              ) : (
                "Apply Recode"
              )}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
