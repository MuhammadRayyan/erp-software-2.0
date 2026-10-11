"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/form-error";
import type { UnitOfMeasure } from "../uom-service";
import { createUnitOfMeasureAction, deleteUnitOfMeasureAction, toggleUnitOfMeasureAction } from "../actions";

export function UomManager({
  businessId,
  units,
}: {
  businessId: string;
  units: UnitOfMeasure[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    if (!code.trim() || !name.trim()) {
      setError("Please provide both unit code (e.g. 'box') and name (e.g. 'Boxes').");
      return;
    }
    setPending(true);
    setError("");
    const res = await createUnitOfMeasureAction(businessId, code, name);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCode("");
    setName("");
    toast.success("Unit of measure added.");
    router.refresh();
  }

  async function handleDelete(id: string) {
    setPending(true);
    const res = await deleteUnitOfMeasureAction(businessId, id);
    setPending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Unit of measure removed.");
    router.refresh();
  }

  async function handleToggle(id: string, current: boolean) {
    const res = await toggleUnitOfMeasureAction(businessId, id, !current);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(!current ? "Unit activated." : "Unit deactivated.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="data-panel p-6">
        <h2 className="text-sm font-semibold">Add Custom Unit of Measure</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Define standard or specialized units of measurement used for inventory items and document lines.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-32 space-y-1.5">
            <Label htmlFor="uom-code">Code</Label>
            <Input
              id="uom-code"
              placeholder="e.g. box"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="w-56 space-y-1.5">
            <Label htmlFor="uom-name">Full Name</Label>
            <Input
              id="uom-name"
              placeholder="e.g. Boxes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
          </div>
          <Button onClick={handleAdd} disabled={pending || !code.trim() || !name.trim()}>
            <Plus className="size-4" /> Add Unit
          </Button>
        </div>

        {error && <div className="mt-3"><FormError message={error} /></div>}
      </div>

      <div className="data-panel">
        <div className="border-b border-border bg-surface px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Available Units of Measure</h2>
          <span className="text-xs text-muted-foreground">{units.length} units configured</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[500px]">
            <thead>
              <tr>
                <th className="w-24">Code</th>
                <th>Unit Name</th>
                <th className="w-28">Status</th>
                <th className="w-24 text-right!">Action</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Badge tone="neutral" className="font-mono text-xs font-semibold">
                      {u.code}
                    </Badge>
                  </td>
                  <td className="font-medium">{u.name}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggle(u.id, u.isActive)}
                      className="cursor-pointer"
                    >
                      <Badge tone={u.isActive ? "success" : "neutral"}>
                        {u.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </button>
                  </td>
                  <td className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-danger"
                      onClick={() => handleDelete(u.id)}
                      disabled={pending}
                      title="Delete unit"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
