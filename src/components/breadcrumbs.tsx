import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/cn";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({
  items,
  businessId,
  className,
}: {
  items: BreadcrumbItem[];
  businessId?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("mb-4 flex items-center text-xs text-muted-foreground", className)}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {businessId && (
          <li className="flex items-center gap-1.5">
            <Link
              href={`/b/${businessId}/overview`}
              className="flex items-center gap-1 transition-colors hover:text-foreground"
              title="Overview"
            >
              <Home className="size-3.5" />
              <span className="sr-only">Overview</span>
            </Link>
            <ChevronRight className="size-3.5 shrink-0 opacity-40" aria-hidden="true" />
          </li>
        )}

        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "max-w-xs truncate",
                    isLast ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}

              {!isLast && (
                <ChevronRight className="size-3.5 shrink-0 opacity-40" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
