import Link from "next/link";
import { Check, ChevronRight, CircleDot } from "lucide-react";

export type FlowStep = {
  key: string;
  label: string;
  documentNumber?: string;
  href?: string;
  statusLabel?: string;
  detail?: string;
  state: "completed" | "current" | "pending" | "skipped";
};

export function DocumentFlowStepper({
  steps,
  className = "",
}: {
  steps: FlowStep[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Document lifecycle flow"
      className={`mb-5 rounded-xl border border-border/80 bg-surface-raised/70 backdrop-blur-xs p-2.5 sm:p-3 shadow-2xs ${className}`}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-0.5 text-sm no-scrollbar">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const isCurrent = step.state === "current";
          const isCompleted = step.state === "completed";
          const isSkipped = step.state === "skipped";

          return (
            <div key={step.key} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
                  isCurrent
                    ? "bg-primary/10 border border-primary/25 text-primary font-medium shadow-2xs"
                    : isCompleted
                    ? "text-foreground hover:bg-surface-muted/50"
                    : isSkipped
                    ? "text-muted-foreground/60 opacity-70"
                    : "text-muted-foreground"
                }`}
              >
                {/* Step indicator circle */}
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold shrink-0 ${
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : isCompleted
                      ? "bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 font-bold"
                      : isSkipped
                      ? "bg-surface-muted text-muted-foreground/50 line-through"
                      : "border border-dashed border-border text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="size-3 stroke-[3]" />
                  ) : isCurrent ? (
                    <CircleDot className="size-3" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </span>

                {/* Content */}
                <div className="flex flex-col leading-tight">
                  <span className="text-[11px] text-muted-foreground font-normal">
                    {step.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {step.href && !isCurrent ? (
                      <Link
                        href={step.href}
                        className="tabular font-medium text-primary hover:underline hover:text-primary/90"
                      >
                        {step.documentNumber || "View"}
                      </Link>
                    ) : (
                      <span className={`tabular font-medium ${isCurrent ? "text-primary" : ""}`}>
                        {step.documentNumber || (isSkipped ? "None" : isCurrent ? "Active" : "Pending")}
                      </span>
                    )}
                    {step.statusLabel && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${
                          isCompleted
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : isCurrent
                            ? "bg-primary/15 text-primary"
                            : "bg-surface-muted text-muted-foreground"
                        }`}
                      >
                        {step.statusLabel}
                      </span>
                    )}
                  </div>
                  {step.detail && (
                    <span className="text-[10px] text-muted-foreground/80 mt-0.5">
                      {step.detail}
                    </span>
                  )}
                </div>
              </div>

              {!isLast && (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
