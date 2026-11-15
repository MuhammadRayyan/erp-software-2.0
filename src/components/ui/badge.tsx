import { cn } from "@/lib/cn";

const styles = {
  neutral: "border-border-strong/70 bg-surface-muted text-muted-foreground",
  info: "border-info/35 bg-info/12 text-info dark:border-info/40 dark:bg-info/18",
  warning: "border-warning/35 bg-warning/12 text-warning dark:border-warning/40 dark:bg-warning/18",
  success: "border-success/35 bg-success/12 text-success dark:border-success/40 dark:bg-success/18",
  danger: "border-danger/35 bg-danger/12 text-danger dark:border-danger/40 dark:bg-danger/18",
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
        "inline-flex h-[22px] items-center rounded-[5px] border px-2 text-[11.5px] font-medium leading-none whitespace-nowrap",
        styles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
