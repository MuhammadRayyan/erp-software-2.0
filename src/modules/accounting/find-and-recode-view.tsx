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
import { Button } from "@/components/ui/button";
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
    if (line.isLocked) return;
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
  const totalSelectedNetMinor = selectedLines.reduce((sum, l) => sum + l.netAmountMinor, 0);

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
        return `/b/${businessId}/reports/bank-transactions`;
      case "manual_journal":
        return `/b/${businessId}/accounting/journal`;
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
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Sources</option>
              <option value="sales_invoice">Sales Invoices</option>
              <option value="purchase_invoice">Purchase Invoices</option>
              <option value="bank_transaction">Bank Transactions</option>
              <option value="manual_journal">Manual Journals</option>
            </select>
          </div>

          {/* Account Filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Current Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Any Account</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          {/* Tax Code Filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Current Tax Code</label>
            <select
              value={taxCodeId}
              onChange={(e) => setTaxCodeId(e.target.value)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Any Tax Code</option>
              {taxCodes.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.name} ({tc.rate_basis_points / 100}%)
                </option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Current Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface-raised px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Any Project</option>
              <option value="none">No Project Assigned</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
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
      {selectedLines.length > 0 && (
        <div className="sticky top-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 shadow-md backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {selectedLines.length}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {selectedLines.length} line{selectedLines.length === 1 ? "" : "s"} selected
            </span>
            <span className="text-xs text-muted-foreground">
              Total Net: <span className="font-mono font-bold text-foreground">{formatMoney(totalSelectedNetMinor, currency)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
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
          <table className="data-table min-w-[1050px]">
            <thead>
              <tr>
                <th className="w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleToggleSelectAll}
                    disabled={unlockedLines.length === 0}
                    className="size-4 rounded border-border-strong text-primary focus:ring-primary"
                    aria-label="Select all unlocked lines"
                  />
                </th>
                <th>Date</th>
                <th>Source</th>
                <th>Doc #</th>
                <th>Contact / Payee</th>
                <th>Description</th>
                <th>Account</th>
                <th>Tax Code</th>
                <th>Project</th>
                <th className="text-right!">Net Amount</th>
                <th className="text-right!">Gross ({currency})</th>
              </tr>
            </thead>
            <tbody>
              {initialLines.map((line) => {
                const key = getLineKey(line);
                const isChecked = selectedKeys.has(key);

                return (
                  <tr
                    key={key}
                    onClick={() => handleToggleLine(line)}
                    className={`cursor-pointer transition-colors ${
                      isChecked ? "bg-primary/5" : line.isLocked ? "opacity-60" : "hover:bg-surface-muted"
                    }`}
                  >
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      {line.isLocked ? (
                        <span title="Locked by financial period lock date">
                          <Lock className="mx-auto size-3.5 text-muted-foreground" />
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleLine(line)}
                          className="size-4 rounded border-border-strong text-primary focus:ring-primary"
                          aria-label={`Select line ${line.description}`}
                        />
                      )}
                    </td>
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
                      {formatMoney(line.grossAmountMinor, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong bg-surface font-semibold text-xs">
                <td colSpan={9} className="h-10 px-3">
                  Showing {initialLines.length} line{initialLines.length === 1 ? "" : "s"}
                </td>
                <td className="text-right pr-2">
                  Total Gross:
                </td>
                <td className="money text-right font-bold pr-3">
                  {formatMoney(initialLines.reduce((sum, l) => sum + l.grossAmountMinor, 0), currency)}
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
                <select
                  value={targetAccount}
                  onChange={(e) => setTargetAccount(e.target.value)}
                  className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Select target account...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} — {acc.type} ({acc.subtype})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  The selected account will replace the revenue/expense account on all checked lines.
                </p>
              </div>
            )}

            {modalType === "project" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Target Project</label>
                <select
                  value={targetProject}
                  onChange={(e) => setTargetProject(e.target.value)}
                  className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Clear Project (Untagged)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Assigning a project updates line reporting across Project Profitability and Job Costing.
                </p>
              </div>
            )}

            {modalType === "taxCode" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Target Tax Code</label>
                <select
                  value={targetTaxCode}
                  onChange={(e) => setTargetTaxCode(e.target.value)}
                  className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Select tax code...</option>
                  {taxCodes.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name} ({tc.rate_basis_points / 100}%)
                    </option>
                  ))}
                </select>
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
            <Button onClick={handleExecuteRecode} disabled={isPending}>
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
