import { cn } from "@/lib/cn";

const styles = {
  neutral: "border-border bg-surface-muted text-muted-foreground",
  info: "border-info/25 bg-info/10 text-info",
  warning: "border-warning/25 bg-warning/10 text-warning",
  success: "border-success/25 bg-success/10 text-success",
  danger: "border-danger/25 bg-danger/10 text-danger",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof styles;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[5px] border px-2 text-[12px] font-medium whitespace-nowrap",
        styles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
