import Link from "next/link";
import {
  Banknote,
  FileInput,
  FileText,
  HandCoins,
  Plus,
  Receipt,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function QuickActionsBar({
  businessId,
  canViewSales,
  canViewPurchases,
  canViewBanking,
}: {
  businessId: string;
  canViewSales: boolean;
  canViewPurchases: boolean;
  canViewBanking: boolean;
}) {
  const actions: {
    label: string;
    href: string;
    icon: typeof Plus;
    tone?: "primary" | "secondary";
  }[] = [];

  if (canViewSales) {
    actions.push(
      {
        label: "New Invoice",
        href: `/b/${businessId}/sales/invoices/new`,
        icon: ReceiptText,
        tone: "primary",
      },
      {
        label: "Record Payment",
        href: `/b/${businessId}/sales/receipts/new`,
        icon: Receipt,
      },
      {
        label: "New Quote",
        href: `/b/${businessId}/sales/quotes/new`,
        icon: FileText,
      }
    );
  }

  if (canViewPurchases) {
    actions.push(
      {
        label: "New Bill",
        href: `/b/${businessId}/purchases/invoices/new`,
        icon: FileInput,
      },
      {
        label: "Pay Supplier",
        href: `/b/${businessId}/purchases/payments/new`,
        icon: HandCoins,
      }
    );
  }

  if (canViewBanking) {
    actions.push({
      label: "Bank Accounts",
      href: `/b/${businessId}/banking/accounts`,
      icon: Banknote,
    });
  }

  if (actions.length === 0) return null;

  return (
    <nav
      aria-label="Quick daily actions"
      className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5 shadow-2xs"
    >
      <span className="px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Quick Actions
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const isPrimary = action.tone === "primary";
          return (
            <Button
              key={action.href}
              asChild
              variant={isPrimary ? "primary" : "secondary"}
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <Link href={action.href}>
                <Plus className="size-3.5" />
                <Icon className="size-3.5" />
                <span>{action.label}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
