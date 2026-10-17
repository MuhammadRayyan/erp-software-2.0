"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Edit2,
  Filter,
  Plus,
  Power,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DialogRoot,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import type { BankRule, BankRuleDirection, BankRuleMatchField, BankRuleMatchType } from "@/modules/banking/bank-rule-service";
import {
  deleteBankRuleAction,
  saveBankRuleAction,
  toggleBankRuleActiveAction,
} from "@/modules/banking/actions";

type AccountOption = { id: string; name: string; type: string };
type TaxCodeOption = { id: string; name: string; rateBasisPoints: number };
type BankAccountOption = { id: string; name: string; currency_code: string };

export function BankRulesManager({
  businessId,
  rules,
  accounts,
  taxCodes,
  bankAccounts,
}: {
  businessId: string;
  rules: BankRule[];
  accounts: AccountOption[];
  taxCodes: TaxCodeOption[];
  bankAccounts: BankAccountOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(searchParams.get("create") === "1");
  const [editingRule, setEditingRule] = useState<BankRule | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<BankRuleDirection>(
    (searchParams.get("direction") as BankRuleDirection) || "money_out",
  );
  const [matchField, setMatchField] = useState<BankRuleMatchField>("description");
  const [matchType, setMatchType] = useState<BankRuleMatchType>("contains");
  const [matchText, setMatchText] = useState(
    searchParams.get("matchText") || searchParams.get("description") || "",
  );
  const [bankAccountId, setBankAccountId] = useState(
    searchParams.get("bankAccountId") || "all",
  );
  const [targetAccountId, setTargetAccountId] = useState(accounts[0]?.id || "");
  const [targetTaxCodeId, setTargetTaxCodeId] = useState("none");
  const [autoDescription, setAutoDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function openCreateModal() {
    setEditingRule(null);
    setName("");
    setDirection("money_out");
    setMatchField("description");
    setMatchType("contains");
    setMatchText("");
    setBankAccountId("all");
    setTargetAccountId(accounts[0]?.id || "");
    setTargetTaxCodeId("none");
    setAutoDescription("");
    setIsActive(true);
    setError("");
    setModalOpen(true);
  }

  function openEditModal(rule: BankRule) {
    setEditingRule(rule);
    setName(rule.name);
    setDirection(rule.direction);
    setMatchField(rule.match_field);
    setMatchType(rule.match_type);
    setMatchText(rule.match_text);
    setBankAccountId(rule.bank_account_id || "all");
    setTargetAccountId(rule.target_account_id);
    setTargetTaxCodeId(rule.target_tax_code_id || "none");
    setAutoDescription(rule.auto_description || "");
    setIsActive(Boolean(rule.is_active));
    setError("");
    setModalOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a rule name.");
      return;
    }
    if (!matchText.trim()) {
      setError("Please enter the text pattern to match.");
      return;
    }
    if (!targetAccountId) {
      setError("Please choose a target GL account.");
      return;
    }

    setError("");
    startTransition(async () => {
      const res = await saveBankRuleAction(businessId, editingRule ? editingRule.id : null, {
        name: name.trim(),
        direction,
        matchField,
        matchType,
        matchText: matchText.trim(),
        bankAccountId: bankAccountId === "all" ? null : bankAccountId,
        targetAccountId,
        targetTaxCodeId: targetTaxCodeId === "none" ? null : targetTaxCodeId,
        autoDescription: autoDescription.trim() || null,
        isActive,
      });

      if (res.error) {
        setError(res.error);
      } else {
        setModalOpen(false);
        router.refresh();
      }
    });
  }

  function handleDelete(ruleId: string) {
    if (!confirm("Are you sure you want to delete this bank rule?")) return;
    startTransition(async () => {
      const res = await deleteBankRuleAction(businessId, ruleId);
      if (res.error) {
        alert(res.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleToggle(ruleId: string, current: number) {
    startTransition(async () => {
      const res = await toggleBankRuleActiveAction(businessId, ruleId, !current);
      if (res.error) {
        alert(res.error);
      } else {
        router.refresh();
      }
    });
  }

  const filteredRules = useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.toLowerCase().trim();
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.match_text.toLowerCase().includes(q) ||
        (r.target_account_name && r.target_account_name.toLowerCase().includes(q)) ||
        (r.bank_account_name && r.bank_account_name.toLowerCase().includes(q)),
    );
  }, [rules, search]);

  return (
    <div className="space-y-4">
      {/* Action Header & Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bank rules…"
            className="pl-9 h-9 text-xs sm:text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Button size="sm" onClick={openCreateModal} className="shrink-0 shadow-xs">
          <Plus className="size-4 mr-1.5" /> New Bank Rule
        </Button>
      </div>

      {/* Rules Table / Cards */}
      {filteredRules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-lg bg-primary/10 text-primary mb-3">
            <Wand2 className="size-5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No bank rules found</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {search
              ? "No bank rules match your search filter."
              : "Bank rules automatically categorize recurring bank statement transactions (utility bills, subscriptions, bank charges, revenue)."}
          </p>
          <Button size="sm" onClick={openCreateModal} className="mt-4 shadow-xs">
            <Plus className="size-4 mr-1.5" /> Create First Rule
          </Button>
        </div>
      ) : (
        <div className="data-panel overflow-hidden border border-border rounded-lg bg-surface-raised">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[850px] w-full text-left text-xs">
              <thead className="bg-surface border-b border-border text-muted-foreground uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Rule Name</th>
                  <th className="py-2.5 px-3 font-semibold">Direction</th>
                  <th className="py-2.5 px-3 font-semibold">Match Criteria</th>
                  <th className="py-2.5 px-3 font-semibold">Target Account</th>
                  <th className="py-2.5 px-3 font-semibold">Tax Code</th>
                  <th className="py-2.5 px-3 font-semibold">Bank Scope</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRules.map((rule) => {
                  return (
                    <tr
                      key={rule.id}
                      className={`hover:bg-surface-muted/30 transition-colors ${
                        !rule.is_active ? "opacity-60 bg-surface-muted/10" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold text-foreground">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="size-3.5 text-primary shrink-0" />
                          <span>{rule.name}</span>
                        </div>
                        {rule.auto_description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                            Sets desc: &ldquo;{rule.auto_description}&rdquo;
                          </p>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <Badge
                          tone={
                            rule.direction === "money_in"
                              ? "success"
                              : rule.direction === "money_out"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {rule.direction === "money_in"
                            ? "Money In"
                            : rule.direction === "money_out"
                            ? "Money Out"
                            : "Both"}
                        </Badge>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="capitalize font-medium text-muted-foreground">
                          {rule.match_field}
                        </span>{" "}
                        <span className="text-[11px] text-muted-foreground/75">
                          {rule.match_type.replace("_", " ")}
                        </span>{" "}
                        <code className="rounded bg-surface-muted px-1.5 py-0.5 text-foreground font-mono text-[11px] border border-border/60">
                          &ldquo;{rule.match_text}&rdquo;
                        </code>
                      </td>

                      <td className="py-2.5 px-3 font-medium text-foreground">
                        {rule.target_account_name || "—"}
                      </td>

                      <td className="py-2.5 px-3 text-muted-foreground">
                        {rule.target_tax_code_name || "No VAT (0%)"}
                      </td>

                      <td className="py-2.5 px-3 text-muted-foreground">
                        {rule.bank_account_name ? (
                          <span className="font-medium text-foreground">
                            {rule.bank_account_name}
                          </span>
                        ) : (
                          <span className="italic text-muted-foreground/70">
                            All Accounts
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleToggle(rule.id, rule.is_active)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                            rule.is_active
                              ? "bg-success/10 text-success border-success/30 hover:bg-success/20"
                              : "bg-surface-muted text-muted-foreground border-border hover:bg-surface-muted/80"
                          }`}
                        >
                          <Power className="size-2.5" />
                          {rule.is_active ? "Active" : "Disabled"}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openEditModal(rule)}
                            title="Edit rule"
                          >
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-danger hover:text-danger hover:bg-danger/10"
                            onClick={() => handleDelete(rule.id)}
                            title="Delete rule"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Rule Modal */}
      <DialogRoot open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl">
          <form onSubmit={handleSave}>
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="size-5 text-primary" />
                {editingRule ? "Edit Bank Rule" : "Create New Bank Rule"}
              </DialogTitle>
              <DialogDescription>
                Define criteria to automatically categorize incoming or outgoing statement lines.
              </DialogDescription>
            </div>

            <div className="space-y-3.5 py-4 text-xs">
              {error && (
                <div className="rounded-md border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
                  {error}
                </div>
              )}

              {/* Rule Name */}
              <div className="space-y-1">
                <Label htmlFor="rule-name" className="text-xs font-semibold">
                  Rule Name *
                </Label>
                <Input
                  id="rule-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. DEWA Electricity Bill, Etisalat Internet, Bank Service Charge"
                  className="h-8.5 text-xs"
                  required
                />
              </div>

              {/* Direction & Bank Account Scope */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rule-direction" className="text-xs font-semibold">
                    Direction
                  </Label>
                  <SelectNative
                    id="rule-direction"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as BankRuleDirection)}
                    className="h-8.5 text-xs"
                  >
                    <option value="money_out">Money Out (Payment)</option>
                    <option value="money_in">Money In (Receipt)</option>
                    <option value="both">Both (Any)</option>
                  </SelectNative>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="rule-bank-account" className="text-xs font-semibold">
                    Bank Account Scope
                  </Label>
                  <SelectNative
                    id="rule-bank-account"
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="h-8.5 text-xs"
                  >
                    <option value="all">All Bank Accounts</option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name} ({ba.currency_code})
                      </option>
                    ))}
                  </SelectNative>
                </div>
              </div>

              {/* Match Criteria */}
              <div className="rounded-md border border-border/70 bg-surface-muted/30 p-3 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Filter className="size-3.5 text-primary" /> Matching Condition
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="rule-match-field" className="text-[11px] text-muted-foreground">Match In</Label>
                    <SelectNative
                      id="rule-match-field"
                      value={matchField}
                      onChange={(e) => setMatchField(e.target.value as BankRuleMatchField)}
                      className="h-8 text-xs bg-surface"
                    >
                      <option value="description">Description</option>
                      <option value="reference">Reference</option>
                      <option value="any">Description or Reference</option>
                    </SelectNative>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="rule-match-type" className="text-[11px] text-muted-foreground">Condition</Label>
                    <SelectNative
                      id="rule-match-type"
                      value={matchType}
                      onChange={(e) => setMatchType(e.target.value as BankRuleMatchType)}
                      className="h-8 text-xs bg-surface"
                    >
                      <option value="contains">Contains (substring)</option>
                      <option value="exact">Exact Match</option>
                      <option value="starts_with">Starts With</option>
                    </SelectNative>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="rule-match-text" className="text-[11px] text-muted-foreground">
                    Pattern Text (case-insensitive) *
                  </Label>
                  <Input
                    id="rule-match-text"
                    value={matchText}
                    onChange={(e) => setMatchText(e.target.value)}
                    placeholder="e.g. DEWA, ETISALAT, SALIK, SERVICE CHARGE, AWS"
                    className="h-8 text-xs bg-surface font-mono"
                    required
                  />
                </div>
              </div>

              {/* Categorization Mapping */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rule-target-account" className="text-xs font-semibold">
                    Target GL Account *
                  </Label>
                  <SelectNative
                    id="rule-target-account"
                    value={targetAccountId}
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="h-8.5 text-xs"
                    required
                  >
                    {accounts.map((acct) => (
                      <option key={acct.id} value={acct.id}>
                        {acct.name} ({acct.type})
                      </option>
                    ))}
                  </SelectNative>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="rule-target-tax" className="text-xs font-semibold">
                    Tax Code
                  </Label>
                  <SelectNative
                    id="rule-target-tax"
                    value={targetTaxCodeId}
                    onChange={(e) => setTargetTaxCodeId(e.target.value)}
                    className="h-8.5 text-xs"
                  >
                    <option value="none">No VAT (0%)</option>
                    {taxCodes.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.name} ({tc.rateBasisPoints / 100}%)
                      </option>
                    ))}
                  </SelectNative>
                </div>
              </div>

              {/* Auto Description */}
              <div className="space-y-1">
                <Label htmlFor="rule-auto-desc" className="text-xs font-semibold">
                  Auto-Generated Description (Optional)
                </Label>
                <Input
                  id="rule-auto-desc"
                  value={autoDescription}
                  onChange={(e) => setAutoDescription(e.target.value)}
                  placeholder="Leave blank to preserve original statement line description"
                  className="h-8.5 text-xs"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rule-active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary size-4"
                />
                <Label htmlFor="rule-active" className="text-xs cursor-pointer font-medium">
                  Rule is active and will evaluate imported statement lines
                </Label>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setModalOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending} className="shadow-xs">
                {pending ? "Saving..." : editingRule ? "Update Rule" : "Create Rule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
