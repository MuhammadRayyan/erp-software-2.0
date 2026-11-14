"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";

export function ProfitLossFilterForm({
  dateFrom = "",
  dateTo = "",
  basis,
  compareMode,
  compareDateFrom = "",
  compareDateTo = "",
}: {
  dateFrom?: string;
  dateTo?: string;
  basis: "accrual" | "cash";
  compareMode: string;
  compareDateFrom?: string;
  compareDateTo?: string;
}) {
  const [selectedBasis, setSelectedBasis] = useState<"accrual" | "cash">(basis);
  const [selectedCompareMode, setSelectedCompareMode] = useState(compareMode);

  return (
    <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-raised p-3.5">
      <label className="space-y-1 text-xs text-muted-foreground">
        From
        <Input
          name="dateFrom"
          type="date"
          defaultValue={dateFrom}
          className="mt-1 w-38 text-foreground"
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        To
        <Input
          name="dateTo"
          type="date"
          defaultValue={dateTo}
          className="mt-1 w-38 text-foreground"
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Basis
        <SelectNative
          name="basis"
          value={selectedBasis}
          onChange={(e) => setSelectedBasis(e.target.value === "cash" ? "cash" : "accrual")}
          className="mt-1 block w-36 text-foreground"
        >
          <option value="accrual">Accrual Basis</option>
          <option value="cash">Cash Basis</option>
        </SelectNative>
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Compare
        <SelectNative
          name="compareMode"
          value={selectedCompareMode}
          onChange={(e) => setSelectedCompareMode(e.target.value)}
          className="mt-1 block w-44 text-foreground"
        >
          <option value="none">No comparison</option>
          <option value="prior_period">Prior period + variance</option>
          <option value="prior_year">Prior year + variance</option>
          <option value="last_3_months">Last 3 months</option>
          <option value="last_4_quarters">Last 4 quarters</option>
          <option value="custom">Custom dates</option>
        </SelectNative>
      </label>
      {selectedCompareMode === "custom" && (
        <>
          <label className="space-y-1 text-xs text-muted-foreground">
            Compare From
            <Input
              name="compareDateFrom"
              type="date"
              defaultValue={compareDateFrom}
              className="mt-1 w-38 text-foreground"
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Compare To
            <Input
              name="compareDateTo"
              type="date"
              defaultValue={compareDateTo}
              className="mt-1 w-38 text-foreground"
            />
          </label>
        </>
      )}
      <Button type="submit" variant="secondary">Update</Button>
      <span className="ml-auto hidden text-xs text-muted-foreground self-center xl:inline">
        {selectedBasis === "cash"
          ? "Cash basis: recognized upon payment"
          : "Accrual basis: recognized when issued"}
      </span>
    </form>
  );
}

export function BalanceSheetFilterForm({
  throughDate = "",
  compareMode,
  compareThroughDate = "",
}: {
  throughDate?: string;
  compareMode: string;
  compareThroughDate?: string;
}) {
  const [selectedCompareMode, setSelectedCompareMode] = useState(compareMode);

  return (
    <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-raised p-3.5">
      <label className="space-y-1 text-xs text-muted-foreground">
        As of date
        <Input
          name="throughDate"
          type="date"
          defaultValue={throughDate}
          className="mt-1 w-40 text-foreground"
        />
      </label>
      <label className="space-y-1 text-xs text-muted-foreground">
        Compare
        <SelectNative
          name="compareMode"
          value={selectedCompareMode}
          onChange={(e) => setSelectedCompareMode(e.target.value)}
          className="mt-1 block w-44 text-foreground"
        >
          <option value="none">No comparison</option>
          <option value="prior_month">Prior month</option>
          <option value="prior_quarter">Prior quarter</option>
          <option value="prior_year">Prior year</option>
          <option value="custom">Custom date</option>
        </SelectNative>
      </label>
      {selectedCompareMode === "custom" && (
        <label className="space-y-1 text-xs text-muted-foreground">
          Compare As of
          <Input
            name="compareThroughDate"
            type="date"
            defaultValue={compareThroughDate}
            className="mt-1 w-40 text-foreground"
          />
        </label>
      )}
      <Button type="submit" variant="secondary">Update</Button>
    </form>
  );
}
