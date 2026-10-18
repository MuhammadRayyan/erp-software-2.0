"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  History,
  Search,
  Calendar,
  User,
  Download,
  FileText,
  CheckCircle2,
  PlusCircle,
  XCircle,
  Settings,
  Shield,
  Trash2,
  RefreshCw,
  ExternalLink,
  Users,
  Layers,
  Clock,
  Mail,
  CheckCheck,
  Upload,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import {
  type ActivityLogItem,
  type ListActivityLogsResult,
  type ActivityLogFilters,
  type ActivityLogSettings,
} from "@/modules/activity-log/activity-log-service";
import {
  getActivityLogsAction,
  updateActivityLogSettingsAction,
  runActivityLogCleanupAction,
} from "@/modules/activity-log/actions";

interface ActivityLogClientProps {
  businessId: string;
  initialData: ListActivityLogsResult;
  usersList: { id: string; name: string; email: string; role: string }[];
  initialRetentionSettings: ActivityLogSettings | null;
  currentUserId: string;
  isAdmin: boolean;
}

function getActionBadge(action: string) {
  switch (action) {
    case "posted":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-3" /> Posted
        </span>
      );
    case "created":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
          <PlusCircle className="size-3" /> Created
        </span>
      );
    case "voided":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
          <XCircle className="size-3" /> Voided
        </span>
      );
    case "deleted":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
          <Trash2 className="size-3" /> Deleted
        </span>
      );
    case "emailed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
          <Mail className="size-3" /> Emailed
        </span>
      );
    case "reconciled":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300">
          <CheckCheck className="size-3" /> Reconciled
        </span>
      );
    case "imported":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
          <Upload className="size-3" /> Imported
        </span>
      );
    case "settings_changed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">
          <Settings className="size-3" /> Setting
        </span>
      );
    case "updated":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <RefreshCw className="size-3" /> Updated
        </span>
      );
  }
}

function getEntityLink(businessId: string, entityType: string, entityId: string | null) {
  if (!entityId) return null;
  switch (entityType) {
    case "sales_invoice":
      return `/b/${businessId}/sales/invoices/${entityId}`;
    case "receipt":
      return `/b/${businessId}/sales/receipts/${entityId}`;
    case "sales_quote":
      return `/b/${businessId}/sales/quotes/${entityId}`;
    case "sales_order":
      return `/b/${businessId}/sales/orders/${entityId}`;
    case "sales_credit_note":
      return `/b/${businessId}/sales/credit-notes/${entityId}`;
    case "purchase_invoice":
      return `/b/${businessId}/purchases/invoices/${entityId}`;
    case "purchase_quote":
      return `/b/${businessId}/purchases/quotes/${entityId}`;
    case "purchase_order":
      return `/b/${businessId}/purchases/orders/${entityId}`;
    case "supplier_payment":
      return `/b/${businessId}/purchases/payments/${entityId}`;
    case "debit_note":
      return `/b/${businessId}/purchases/debit-notes/${entityId}`;
    case "customer":
      return `/b/${businessId}/customers/${entityId}`;
    case "supplier":
      return `/b/${businessId}/suppliers/${entityId}`;
    case "inventory_item":
      return `/b/${businessId}/inventory/items`;
    case "stock_adjustment":
      return `/b/${businessId}/inventory/adjustments/${entityId}`;
    case "bank_rule":
      return `/b/${businessId}/settings/bank-rules`;
    case "project":
      return `/b/${businessId}/projects/${entityId}`;
    case "account":
      return `/b/${businessId}/accounting/chart-of-accounts`;
    case "business_profile":
      return `/b/${businessId}/settings/business-profile`;
    case "tax_settings":
      return `/b/${businessId}/settings/tax`;
    case "custom_field":
      return `/b/${businessId}/settings/custom-fields`;
    case "financial_lock":
      return `/b/${businessId}/settings/financial-lock`;
    case "user_access":
      return `/b/${businessId}/settings/users`;
    case "activity_log_retention":
      return `/b/${businessId}/settings/activity-log`;
    default:
      return null;
  }
}

function getEntityDisplayName(entityType: string) {
  switch (entityType) {
    case "sales_invoice":
      return "Sales Invoice";
    case "receipt":
      return "Payment Receipt";
    case "sales_quote":
      return "Sales Quote";
    case "sales_order":
      return "Sales Order";
    case "sales_credit_note":
      return "Credit Note";
    case "purchase_invoice":
      return "Purchase Invoice";
    case "purchase_quote":
      return "Purchase Quote";
    case "purchase_order":
      return "Purchase Order";
    case "supplier_payment":
      return "Supplier Payment";
    case "debit_note":
      return "Debit Note";
    case "customer":
      return "Customer";
    case "supplier":
      return "Supplier";
    case "inventory_item":
      return "Inventory Item";
    case "stock_adjustment":
      return "Stock Adjustment";
    case "bank_rule":
      return "Bank Rule";
    case "project":
      return "Project";
    case "account":
      return "Chart of Accounts";
    case "email_dispatch":
      return "Email Dispatch";
    case "financial_lock":
      return "Financial Lock";
    case "user_access":
      return "User Access";
    case "business_profile":
      return "Business Profile";
    case "tax_settings":
      return "Tax Settings";
    case "custom_field":
      return "Custom Field";
    case "activity_log_retention":
      return "Retention Policy";
    default:
      return entityType.replace(/_/g, " ");
  }
}

function getUserInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatDateGroup(isoString: string) {
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(isoString: string) {
  const d = new Date(isoString);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityLogClient({
  businessId,
  initialData,
  usersList,
  initialRetentionSettings,
  currentUserId,
  isAdmin,
}: ActivityLogClientProps) {
  const [data, setData] = useState<ListActivityLogsResult>(initialData);
  const [isPending, startTransition] = useTransition();

  // Retention policy state (Admin only)
  const [retentionSettings, setRetentionSettings] = useState<ActivityLogSettings | null>(initialRetentionSettings);
  const [retentionEnabled, setRetentionEnabled] = useState(initialRetentionSettings?.retentionEnabled ?? false);
  const [retentionDays, setRetentionDays] = useState(initialRetentionSettings?.retentionDays ?? 90);
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const [isPruningLogs, setIsPruningLogs] = useState(false);
  const [showRetentionPanel, setShowRetentionPanel] = useState(false);

  // Filters state
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [selectedEntityType, setSelectedEntityType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"all" | "today" | "7d" | "30d">("all");

  async function handleSaveRetention() {
    try {
      setIsSavingRetention(true);
      const updated = await updateActivityLogSettingsAction(businessId, {
        retentionEnabled,
        retentionDays,
      });
      setRetentionSettings(updated);
      toast.success(
        updated.retentionEnabled
          ? `Automated retention cleanup active (${updated.retentionDays} days).`
          : "Automated retention cleanup disabled. Audit logs will be preserved indefinitely.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update retention policy.");
    } finally {
      setIsSavingRetention(false);
    }
  }

  async function handlePruneLogs() {
    const confirmed = window.confirm(
      `Permanently purge all activity logs older than ${retentionDays} days? This action cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      setIsPruningLogs(true);
      const result = await runActivityLogCleanupAction(businessId, retentionDays);
      toast.success(
        result.deletedCount > 0
          ? `Pruned ${result.deletedCount} activity logs older than ${retentionDays} days (${result.cutoffDate.slice(0, 10)}).`
          : `No activity logs found older than ${retentionDays} days to prune.`,
      );
      setRetentionSettings((prev) =>
        prev
          ? {
              ...prev,
              lastCleanupAt: result.lastCleanupAt,
              lastCleanupCount: result.deletedCount,
            }
          : prev,
      );
      // Reload logs
      const refreshed = await getActivityLogsAction(businessId, {
        search,
        userId: selectedUser === "all" ? undefined : selectedUser,
        action: selectedAction === "all" ? undefined : selectedAction,
        entityType: selectedEntityType === "all" ? undefined : selectedEntityType,
        dateRange,
      });
      setData(refreshed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to execute manual pruning.");
    } finally {
      setIsPruningLogs(false);
    }
  }

  function handleFilterChange(newFilters: Partial<ActivityLogFilters>) {
    const nextFilters: ActivityLogFilters = {
      search: newFilters.search !== undefined ? newFilters.search : search,
      userId: (newFilters.userId !== undefined ? newFilters.userId : selectedUser) === "all" ? undefined : (newFilters.userId ?? selectedUser),
      action: (newFilters.action !== undefined ? newFilters.action : selectedAction) === "all" ? undefined : (newFilters.action ?? selectedAction),
      entityType: (newFilters.entityType !== undefined ? newFilters.entityType : selectedEntityType) === "all" ? undefined : (newFilters.entityType ?? selectedEntityType),
      dateRange: (newFilters.dateRange !== undefined ? newFilters.dateRange : dateRange),
    };

    startTransition(async () => {
      try {
        const result = await getActivityLogsAction(businessId, nextFilters);
        setData(result);
      } catch (err) {
        console.error("Failed to load activity logs:", err);
      }
    });
  }

  function resetFilters() {
    setSearch("");
    setSelectedUser("all");
    setSelectedAction("all");
    setSelectedEntityType("all");
    setDateRange("all");
    startTransition(async () => {
      try {
        const result = await getActivityLogsAction(businessId, {});
        setData(result);
      } catch (err) {
        console.error("Failed to reset activity logs:", err);
      }
    });
  }

  // Export filtered logs to CSV
  function exportCSV() {
    if (!data.logs || data.logs.length === 0) return;
    const headers = ["Timestamp", "User Name", "User Email", "Action", "Entity Type", "Entity Number", "Summary", "IP Address"];
    const rows = data.logs.map((log) => [
      `"${log.createdAt}"`,
      `"${log.userName.replace(/"/g, '""')}"`,
      `"${log.userEmail.replace(/"/g, '""')}"`,
      `"${log.action}"`,
      `"${log.entityType}"`,
      `"${(log.entityNumber || "").replace(/"/g, '""')}"`,
      `"${log.summary.replace(/"/g, '""')}"`,
      `"${log.ipAddress || ""}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Group logs by date
  const groupedLogs = useMemo(() => {
    const groups: { dateGroup: string; items: ActivityLogItem[] }[] = [];
    const groupMap = new Map<string, ActivityLogItem[]>();

    for (const log of data.logs) {
      const key = formatDateGroup(log.createdAt);
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(log);
    }

    for (const [dateGroup, items] of groupMap.entries()) {
      groups.push({ dateGroup, items });
    }

    return groups;
  }, [data.logs]);

  return (
    <div className="space-y-6">
      {/* Metrics Header */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-surface-raised p-4 transition-all">
          <div className="flex items-center gap-2 text-muted-foreground">
            <History className="size-4 text-primary" />
            <span className="text-xs font-medium uppercase tracking-wider">Total Events</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {data.metrics.totalCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin ? "Across all workspace users" : "Your recorded actions"}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-4 transition-all">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium uppercase tracking-wider">Postings</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {data.metrics.postedCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Invoices & payments posted</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-4 transition-all">
          <div className="flex items-center gap-2 text-muted-foreground">
            <PlusCircle className="size-4 text-sky-600 dark:text-sky-400" />
            <span className="text-xs font-medium uppercase tracking-wider">Created</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400">
            {data.metrics.createdCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Drafts & new records</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-4 transition-all">
          <div className="flex items-center gap-2 text-muted-foreground">
            <XCircle className="size-4 text-rose-600 dark:text-rose-400" />
            <span className="text-xs font-medium uppercase tracking-wider">Voided</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
            {data.metrics.voidedCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Reversals & cancellations</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-4 transition-all col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            {isAdmin ? (
              <>
                <Users className="size-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-medium uppercase tracking-wider">Active Users</span>
              </>
            ) : (
              <>
                <Settings className="size-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-medium uppercase tracking-wider">Settings</span>
              </>
            )}
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {isAdmin ? data.metrics.uniqueUsersCount : data.metrics.settingsCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin ? "Team members logging actions" : "Configuration updates"}
          </p>
        </div>
      </div>

      {/* Role notice banner if standard user */}
      {!isAdmin && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <Shield className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">
              Personal Audit View ({usersList.find((u) => u.id === currentUserId)?.name || "Your Account"})
            </p>
            <p className="text-xs text-muted-foreground">
              You are viewing your personal activity history. Administrator accounts can inspect organization-wide activity across all users.
            </p>
          </div>
        </div>
      )}

      {/* Admin Automated Log Retention & Cleanup Policy */}
      {isAdmin && retentionSettings && (
        <div className="rounded-lg border border-border bg-surface-raised p-4 transition-all">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Clock className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Automated Log Retention & Cleanup Policy
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      retentionSettings.retentionEnabled
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-surface-muted text-muted-foreground"
                    }`}
                  >
                    {retentionSettings.retentionEnabled
                      ? `Active · ${retentionSettings.retentionDays} Days`
                      : "Disabled · Indefinite"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automate log retention compliance and storage pruning across organizational operational events.
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowRetentionPanel(!showRetentionPanel)}
              className="gap-1.5 self-start sm:self-auto text-xs"
            >
              <Sliders className="size-3.5" />
              <span>{showRetentionPanel ? "Hide Policy Controls" : "Configure Retention"}</span>
            </Button>
          </div>

          {showRetentionPanel && (
            <div className="mt-4 pt-4 border-t border-border/60 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Enable toggle */}
                <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface p-3">
                  <input
                    type="checkbox"
                    id="retentionEnabled"
                    checked={retentionEnabled}
                    onChange={(e) => setRetentionEnabled(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <div>
                    <label htmlFor="retentionEnabled" className="text-xs font-semibold text-foreground cursor-pointer">
                      Enable Automated Retention
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Automatically schedule background cleanup for logs older than the threshold.
                    </p>
                  </div>
                </div>

                {/* Duration selector */}
                <div className="rounded-lg border border-border/60 bg-surface p-3 space-y-1">
                  <label htmlFor="retentionDays" className="text-xs font-semibold text-foreground">
                    Retention Window
                  </label>
                  <SelectNative
                    id="retentionDays"
                    value={String(retentionDays)}
                    onChange={(e) => setRetentionDays(Number(e.target.value))}
                    className="h-8 text-xs w-full"
                  >
                    <option value="30">30 Days (1 Month)</option>
                    <option value="60">60 Days (2 Months)</option>
                    <option value="90">90 Days (Recommended · NetSuite Standard)</option>
                    <option value="180">180 Days (6 Months)</option>
                    <option value="365">365 Days (1 Year)</option>
                    <option value="730">730 Days (2 Years)</option>
                    <option value="2555">2,555 Days (7 Years · Statutory Tax)</option>
                  </SelectNative>
                </div>

                {/* Status info */}
                <div className="rounded-lg border border-border/60 bg-surface p-3 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Pruning Telemetry
                    </span>
                    <p className="text-xs text-foreground mt-1">
                      {retentionSettings.lastCleanupAt
                        ? `Last pruned: ${new Date(retentionSettings.lastCleanupAt).toLocaleString()}`
                        : "No manual or automated pruning recorded"}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {retentionSettings.lastCleanupCount} records pruned in latest cycle
                  </p>
                </div>
              </div>

              {/* Actions row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
                <p className="text-[11px] text-muted-foreground">
                  Changes take effect immediately across all workspace activity logs.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePruneLogs}
                    disabled={isPruningLogs}
                    className="text-xs gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 dark:text-rose-400"
                  >
                    <Trash2 className="size-3.5" />
                    <span>{isPruningLogs ? "Pruning..." : "Prune Expired Logs Now"}</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveRetention}
                    disabled={isSavingRetention}
                    className="text-xs gap-1.5"
                  >
                    <CheckCircle2 className="size-3.5" />
                    <span>{isSavingRetention ? "Saving..." : "Save Retention Policy"}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter and Control Toolbar */}
      <div className="rounded-lg border border-border bg-surface-raised p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by document #, customer, summary, or user..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                handleFilterChange({ search: e.target.value });
              }}
              className="pl-9 text-sm"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCSV}
              disabled={data.logs.length === 0}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              <span>Export CSV</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Filter dropdowns & pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
          {/* User selector for Admin */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 min-w-[170px]">
              <User className="size-3.5 text-muted-foreground" />
              <SelectNative
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  handleFilterChange({ userId: e.target.value });
                }}
                className="h-8 text-xs"
              >
                <option value="all">All Team Members</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === "administrator" ? "Admin" : "Standard"})
                  </option>
                ))}
              </SelectNative>
            </div>
          )}

          {/* Entity Type selector */}
          <div className="flex items-center gap-1.5 min-w-[160px]">
            <Layers className="size-3.5 text-muted-foreground" />
            <SelectNative
              value={selectedEntityType}
              onChange={(e) => {
                setSelectedEntityType(e.target.value);
                handleFilterChange({ entityType: e.target.value });
              }}
              className="h-8 text-xs"
            >
              <option value="all">All Document Types</option>
              <optgroup label="Sales">
                <option value="sales_invoice">Sales Invoices</option>
                <option value="sales_quote">Sales Quotes</option>
                <option value="sales_order">Sales Orders</option>
                <option value="sales_credit_note">Credit Notes</option>
                <option value="receipt">Payment Receipts</option>
                <option value="customer">Customers</option>
              </optgroup>
              <optgroup label="Purchases">
                <option value="purchase_invoice">Purchase Invoices</option>
                <option value="purchase_quote">Purchase Quotes</option>
                <option value="purchase_order">Purchase Orders</option>
                <option value="debit_note">Debit Notes</option>
                <option value="supplier_payment">Supplier Payments</option>
                <option value="supplier">Suppliers</option>
              </optgroup>
              <optgroup label="Inventory & Projects">
                <option value="inventory_item">Inventory Items</option>
                <option value="stock_adjustment">Stock Adjustments</option>
                <option value="project">Projects</option>
              </optgroup>
              <optgroup label="Accounting & Operations">
                <option value="account">Chart of Accounts</option>
                <option value="bank_rule">Bank Rules</option>
                <option value="email_dispatch">Email Dispatches</option>
                <option value="financial_lock">Financial Lock</option>
                <option value="user_access">User Access</option>
                <option value="business_profile">Business Profile</option>
                <option value="tax_settings">Tax Settings</option>
                <option value="custom_field">Custom Fields</option>
                <option value="activity_log_retention">Retention Policy</option>
              </optgroup>
            </SelectNative>
          </div>

          {/* Date Range pills */}
          <div className="flex items-center gap-1 ml-auto">
            <Calendar className="size-3.5 text-muted-foreground mr-1" />
            {(["all", "today", "7d", "30d"] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => {
                  setDateRange(range);
                  handleFilterChange({ dateRange: range });
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  dateRange === range
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {range === "all" ? "All Time" : range === "today" ? "Today" : range === "7d" ? "7 Days" : "30 Days"}
              </button>
            ))}
          </div>
        </div>

        {/* Action badges filter row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground font-medium mr-1">Action:</span>
          {(["all", "posted", "created", "updated", "voided", "deleted", "emailed", "reconciled", "settings_changed"] as const).map((act) => (
            <button
              key={act}
              type="button"
              onClick={() => {
                setSelectedAction(act);
                handleFilterChange({ action: act });
              }}
              className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                selectedAction === act
                  ? "bg-secondary text-secondary-foreground font-semibold ring-1 ring-border-strong"
                  : "bg-surface-muted/60 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              {act === "all" ? "All" : act === "settings_changed" ? "Settings" : act[0].toUpperCase() + act.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Timeline Feed */}
      <div className="space-y-6">
        {isPending ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <RefreshCw className="mr-2 size-4 animate-spin text-primary" />
            Loading activity history...
          </div>
        ) : groupedLogs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-surface-muted">
              <History className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-base font-semibold">No activity logs found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || selectedAction !== "all" || selectedEntityType !== "all" || dateRange !== "all" || (isAdmin && selectedUser !== "all")
                ? "Try clearing filters or search terms to inspect more events."
                : "Actions taken across invoices, receipts, and settings will appear here automatically."}
            </p>
            <Button variant="secondary" size="sm" onClick={resetFilters} className="mt-4">
              Clear all filters
            </Button>
          </div>
        ) : (
          groupedLogs.map((group) => (
            <div key={group.dateGroup} className="space-y-3">
              {/* Sticky day header */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.dateGroup}
                </span>
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-[11px] text-muted-foreground">
                  {group.items.length} {group.items.length === 1 ? "event" : "events"}
                </span>
              </div>

              {/* Event Cards */}
              <div className="space-y-2">
                {group.items.map((log) => {
                  const link = getEntityLink(businessId, log.entityType, log.entityId);

                  return (
                    <div
                      key={log.id}
                      className="group relative rounded-lg border border-border bg-surface-raised p-4 transition-all hover:border-border-strong hover:shadow-xs"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {/* User, Action, Entity badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* User Avatar */}
                          <div
                            className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                            title={`${log.userName} (${log.userEmail})`}
                          >
                            {getUserInitials(log.userName)}
                          </div>

                          <span className="text-sm font-semibold text-foreground">
                            {log.userName}
                          </span>

                          <span className="text-xs text-muted-foreground">
                            ({log.userEmail})
                          </span>

                          {/* Action Badge */}
                          {getActionBadge(log.action)}

                          {/* Entity Type Badge */}
                          <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {getEntityDisplayName(log.entityType)}
                          </span>

                          {/* Clickable Entity Link if available */}
                          {link && log.entityNumber && (
                            <Link
                              href={link}
                              className="inline-flex items-center gap-1 rounded bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                            >
                              <FileText className="size-3" />
                              <span>{log.entityNumber}</span>
                              <ExternalLink className="size-2.5 opacity-60" />
                            </Link>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <time title={log.createdAt}>{formatTime(log.createdAt)}</time>
                          {log.ipAddress && (
                            <span className="hidden text-[11px] opacity-75 sm:inline">
                              IP: {log.ipAddress}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Summary description */}
                      <p className="mt-2 text-sm text-foreground/90 leading-relaxed">
                        {log.summary}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
