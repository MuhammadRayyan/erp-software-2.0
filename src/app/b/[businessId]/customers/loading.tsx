import { LoaderCircle } from "lucide-react";

export default function CustomersLoading() {
  return (
    <div className="page-container">
      <div className="flex items-center gap-3 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
        <span>Loading customers…</span>
      </div>
    </div>
  );
}

