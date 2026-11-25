"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrencyMinorUnit } from "@/core/format";
import { minorToCurrencyInput, parseCurrencyAmountToMinor } from "@/modules/currency/conversion";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { APPROVAL_ENTITY_CONFIG, type ApprovalRuleRecord } from "@/modules/approvals/approval-constants";
import { saveApprovalRulesAction } from "@/modules/approvals/approval-actions";

const ACTIVE_ENTITY_TYPES = new Set([
  "sales_invoice",
  "purchase_invoice",
  "purchase_order",
  "supplier_payment",
  "receipt",
]);

export function ApprovalRulesClient({
  businessId,
  currency,
  isAdmin,
  initialRules,
}: {
  businessId: string;
  currency: string;
  isAdmin: boolean;
  initialRules: ApprovalRuleRecord[];
}) {
  const router = useRouter();
  const minorUnit = getCurrencyMinorUnit(currency);
  const baselineRules = useMemo(
    () => initialRules.filter((r) => ACTIVE_ENTITY_TYPES.has(r.entityType)),
    [initialRules],
  );
  const [rules, setRules] = useState(baselineRules);
  const [thresholdInputs, setThresholdInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      baselineRules.map((r) => [r.entityType, minorToCurrencyInput(r.thresholdMinor, minorUnit)]),
    ),
  );
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    setRules(baselineRules);
    setThresholdInputs(
      Object.fromEntries(
        baselineRules.map((r) => [r.entityType, minorToCurrencyInput(r.thresholdMinor, minorUnit)]),
      ),
    );
  }, [baselineRules, minorUnit]);

  const isDirty = useMemo(() => {
    if (rules.length !== baselineRules.length) return true;
    for (let i = 0; i < rules.length; i += 1) {
      const curr = rules[i];
      const orig = baselineRules[i];
      if (!orig || curr.entityType !== orig.entityType) return true;
      if (curr.isEnabled !== orig.isEnabled) return true;
      if (curr.requireCheckerSeparation !== orig.requireCheckerSeparation) return true;
      if (curr.thresholdMinor !== orig.thresholdMinor) return true;
      const origInput = minorToCurrencyInput(orig.thresholdMinor, minorUnit);
      if ((thresholdInputs[curr.entityType] ?? origInput) !== origInput) return true;
    }
    return false;
  }, [rules, baselineRules, thresholdInputs, minorUnit]);

  useUnsavedChanges(isDirty && isAdmin);

  function updateLocal(entityType: string, patch: Partial<ApprovalRuleRecord>) {
    setRules((prev) =>
      prev.map((r) => (r.entityType === entityType ? { ...r, ...patch } : r)),
    );
  }

  async function saveAllRules() {
    const payload: Array<{
      entityType: string;
      isEnabled: boolean;
      thresholdMinor: number;
      requireCheckerSeparation: boolean;
    }> = [];

    for (const rule of rules) {
      const rawText = (thresholdInputs[rule.entityType] ?? minorToCurrencyInput(rule.thresholdMinor, minorUnit)).trim();
      let thresholdMinor = 0;
      if (rawText) {
        try {
          thresholdMinor = parseCurrencyAmountToMinor(
            rawText,
            minorUnit,
            `${APPROVAL_ENTITY_CONFIG[rule.entityType as keyof typeof APPROVAL_ENTITY_CONFIG]?.label ?? rule.entityType} threshold`,
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Invalid threshold amount.");
          return;
        }
      }
      payload.push({
        entityType: rule.entityType,
        isEnabled: rule.isEnabled,
        thresholdMinor,
        requireCheckerSeparation: rule.requireCheckerSeparation,
      });
    }

    setSavingAll(true);
    try {
      const res = await saveApprovalRulesAction(businessId, payload);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Approval settings saved.");
      router.refresh();
    } finally {
      setSavingAll(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {!isAdmin && (
        <div className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-sm">
          Only a business Administrator can modify approval rules and thresholds.
        </div>
      )}
      <div className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">Per-User Approval Permissions</p>
          <p className="text-xs">
            Users set to <strong>Requires approval before posting</strong> always route submissions through the Approval Queue regardless of threshold. Users set to <strong>Can proceed without approval</strong> post directly below enabled thresholds.
          </p>
        </div>
        {isAdmin && (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/b/${businessId}/settings/users`}>Manage User Approval Control</Link>
          </Button>
        )}
      </div>

      <div className="data-panel divide-y divide-border">
        {rules.map((rule) => {
          const cfg = APPROVAL_ENTITY_CONFIG[rule.entityType as keyof typeof APPROVAL_ENTITY_CONFIG];
          const majorAmount = thresholdInputs[rule.entityType] ?? minorToCurrencyInput(rule.thresholdMinor, minorUnit);
          return (
            <div key={rule.entityType} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <span className="font-semibold text-sm">{cfg?.label ?? rule.entityType}</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={rule.isEnabled}
                      onChange={(e) =>
                        updateLocal(rule.entityType, { isEnabled: e.target.checked })
                      }
                      className="size-4 accent-[var(--primary)]"
                    />
                    Enable spend threshold ({currency})
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={rule.requireCheckerSeparation}
                      onChange={(e) =>
                        updateLocal(rule.entityType, {
                          requireCheckerSeparation: e.target.checked,
                        })
                      }
                      className="size-4 accent-[var(--primary)]"
                    />
                    Require different user as checker
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="w-36">
                  <Input
                    type="text"
                    inputMode="decimal"
                    disabled={!isAdmin || !rule.isEnabled}
                    aria-label={`Spend threshold for ${cfg?.label ?? rule.entityType}`}
                    value={majorAmount}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setThresholdInputs((prev) => ({ ...prev, [rule.entityType]: raw }));
                      try {
                        const minor = raw.trim() ? parseCurrencyAmountToMinor(raw, minorUnit) : 0;
                        updateLocal(rule.entityType, { thresholdMinor: minor });
                      } catch {
                        // Leave last valid minor until blur or save validates
                      }
                    }}
                    onBlur={() => {
                      const raw = (thresholdInputs[rule.entityType] ?? "").trim();
                      try {
                        const minor = raw ? parseCurrencyAmountToMinor(raw, minorUnit) : 0;
                        setThresholdInputs((prev) => ({
                          ...prev,
                          [rule.entityType]: minorToCurrencyInput(minor, minorUnit),
                        }));
                        updateLocal(rule.entityType, { thresholdMinor: minor });
                      } catch {
                        // Preserve invalid text so user sees validation message on save
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="flex justify-end">
          <Button
            permission="edit"
            disabled={savingAll}
            onClick={saveAllRules}
          >
            {savingAll ? "Saving…" : "Save Approval Settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
