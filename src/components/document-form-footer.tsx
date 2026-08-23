import { Button } from "@/components/ui/button";

export function DocumentFormFooter({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-sm sm:mx-0 sm:rounded-t-lg sm:border-x">
      <Button variant="ghost" onClick={onCancel} type="button">Cancel</Button>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

