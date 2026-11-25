"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select-native";
import {
  deleteCustomReportViewAction,
  saveCustomReportViewAction,
} from "@/modules/reports/actions";
import type {
  SavedReportRecord,
  SavedReportType,
} from "@/modules/reports/saved-report-service";

export function SavedReportToolbar({
  businessId,
  reportType,
  currentConfig,
  savedViews,
  activeViewId,
  basePath,
}: {
  businessId: string;
  reportType: SavedReportType;
  currentConfig: Record<string, unknown>;
  savedViews: SavedReportRecord[];
  activeViewId?: string;
  basePath: string;
}) {
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activeView = savedViews.find((v) => v.id === activeViewId);

  function navigateToView(view: SavedReportRecord) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(view.config)) {
      if (v !== undefined && v !== null && v !== "") {
        qs.set(k, String(v));
      }
    }
    qs.set("viewId", view.id);
    router.push(`${basePath}?${qs.toString()}`);
  }

  function loadView(viewId: string) {
    if (!viewId) {
      router.push(basePath);
      return;
    }
    const target = savedViews.find((v) => v.id === viewId);
    if (!target) return;
    navigateToView(target);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Please enter a name for this saved view.");
      return;
    }
    setSaving(true);
    const res = await saveCustomReportViewAction(businessId, {
      name: name.trim(),
      reportType,
      description: description.trim(),
      config: currentConfig,
      isShared,
    });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error(res.error || "Could not save report view.");
      return;
    }
    toast.success(`Saved report view "${res.data.name}".`);
    setSaveOpen(false);
    setName("");
    setDescription("");
    navigateToView(res.data);
  }

  async function handleDeleteActive() {
    if (!activeView) return;
    setDeleting(true);
    const res = await deleteCustomReportViewAction(businessId, activeView.id);
    setDeleting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Deleted saved view "${activeView.name}".`);
    router.push(basePath);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {savedViews.length > 0 && (
        <div className="flex items-center gap-1.5">
          <BookmarkCheck className="size-4 text-muted-foreground" />
          <SelectNative
            aria-label="Load saved report view"
            value={activeViewId ?? ""}
            onChange={(e) => loadView(e.target.value)}
            className="h-9 w-48 text-xs"
          >
            <option value="">Saved views ({savedViews.length})</option>
            {savedViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </SelectNative>
        </div>
      )}

      {activeView && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={deleting}
          onClick={handleDeleteActive}
          title="Delete active saved view"
          className="text-danger hover:text-danger hover:bg-danger/10"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}

      <Button type="button" variant="secondary" size="sm" onClick={() => setSaveOpen(true)}>
        <Bookmark className="size-3.5" /> Save View
      </Button>

      <DialogRoot open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Save Custom Report View</DialogTitle>
          <DialogDescription>
            Save the current date range, basis, comparison periods, and filters so your team can reopen this view in one click.
          </DialogDescription>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="saved-report-name">View Name *</Label>
              <Input
                id="saved-report-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 YoY Cash Basis Comparison"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="saved-report-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                id="saved-report-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes on filters or audience"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Share this view with other users in this business
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              <Plus className="size-3.5" /> {saving ? "Saving…" : "Save View"}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </div>
  );
}
