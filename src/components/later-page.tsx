import { Clock3 } from "lucide-react";

export function LaterPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="page-container">
      <div className="page-header"><div><h1 className="page-title">{title}</h1><p className="page-description">{description}</p></div></div>
      <div className="max-w-xl rounded-lg border border-border bg-surface-raised p-6">
        <span className="grid size-9 place-items-center rounded-md bg-surface-muted text-muted-foreground"><Clock3 className="size-4" /></span>
        <h2 className="mt-4 text-base font-semibold">Planned for a later phase</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">This navigation position is reserved so the product structure can be evaluated now. No accounting logic or future module infrastructure has been added.</p>
      </div>
    </div>
  );
}
