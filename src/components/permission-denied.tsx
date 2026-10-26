import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PermissionDenied({
  module,
  action,
  returnHref = "/businesses",
  returnLabel = "Return to businesses",
}: {
  module?: string;
  action?: string;
  returnHref?: string;
  returnLabel?: string;
}) {
  return (
    <div className="page-container">
      <div className="max-w-xl rounded-lg border border-border bg-surface-raised p-6">
        <span className="grid size-10 place-items-center rounded-md bg-danger/10 text-danger">
          <ShieldX className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">{action ? "Action permission required" : "Module access required"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {action ? `Your role does not allow you to ${action} records in ${module ?? "this module"}.` : `Your role does not include access to ${module ?? "this module"}.`} Ask a business administrator to update your permissions.
        </p>
        <Button asChild className="mt-5"><Link href={returnHref}>{returnLabel}</Link></Button>
      </div>
    </div>
  );
}
