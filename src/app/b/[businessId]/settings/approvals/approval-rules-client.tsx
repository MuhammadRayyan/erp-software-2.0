"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APPROVAL_ENTITY_CONFIG, type ApprovalRuleRecord } from "@/modules/approvals/approval-constants";
import { saveApprovalRuleAction } from "@/modules/approvals/approval-actions";

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
  const [rules, setRules] = useState(
    initialRules.filter((r) => ACTIVE_ENTITY_TYPES.has(r.entityType)),
  );
  const [savingType, setSavingType] = useState<string | null>(null);

  function updateLocal(entityType: string, patch: Partial<ApprovalRuleRecord>) {
    setRules((prev) =>
      prev.map((r) => (r.entityType === entityType ? { ...r, ...patch } : r)),
    );
  }

  async function saveRule(rule: ApprovalRuleRecord) {
    setSavingType(rule.entityType);
    const res = await saveApprovalRuleAction(businessId, {
      entityType: rule.entityType,
      isEnabled: rule.isEnabled,
      thresholdMinor: rule.thresholdMinor,
      requireCheckerSeparation: rule.requireCheckerSeparation,
    });
    setSavingType(null);
    if (res.error) return toast.error(res.error);
    toast.success("Approval rule saved.");
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="rounded-lg border border-border bg-surface-raised p-4 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">Per-User Approval Permissions</p>
          <p className="text-xs">
            Users set to <strong>Requires approval before posting</strong> always route submissions through the Approval Queue regardless of threshold. Users set to <strong>Can proceed without approval</strong> post directly below enabled thresholds.
          </p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/b/${businessId}/settings/users`}>Manage User Approval Control</Link>
        </Button>
      </div>

      <div className="data-panel divide-y divide-border">
        {rules.map((rule) => {
          const cfg = APPROVAL_ENTITY_CONFIG[rule.entityType as keyof typeof APPROVAL_ENTITY_CONFIG];
          const majorAmount = (rule.thresholdMinor / 100).toFixed(2);
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
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={!isAdmin || !rule.isEnabled}
                    aria-label={`Spend threshold for ${cfg?.label ?? rule.entityType}`}
                    value={majorAmount}
                    onChange={(e) => {
                      const num = parseFloat(e.target.value);
                      updateLocal(rule.entityType, {
                        thresholdMinor: Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : 0,
                      });
                    }}
                  />
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={savingType === rule.entityType}
                    onClick={() => saveRule(rule)}
                  >
                    {savingType === rule.entityType ? "Saving…" : "Save"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
