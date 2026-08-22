import Link from "next/link";
import { ArrowRight, Coins, FileText, ListOrdered, Percent, ReceiptText, Send, ShieldCheck } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";

export default async function SettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  await requireModule(businessId, "settings");
  const items = [
    { title: "Users & access", description: "Assign local users, simple roles, and visible modules.", href: `/b/${businessId}/settings/users`, icon: ShieldCheck },
    { title: "Numbering", description: "Set sales and purchase document prefixes and next numbers.", href: `/b/${businessId}/settings/numbering`, icon: ListOrdered },
    { title: "Currencies & exchange rates", description: "Base currency, minor units, dated rates, and realized FX account mappings.", href: `/b/${businessId}/settings/currencies`, icon: Coins },
    { title: "UAE VAT settings", description: "Registration, TRN, effective dates, default Emirate, and the current tax lock.", href: `/b/${businessId}/settings/tax`, icon: ReceiptText },
    { title: "Electronic Invoicing", description: "PINT-AE readiness, seller identity, specification version, and Mock ASP settings.", href: `/b/${businessId}/settings/einvoicing`, icon: Send },
    { title: "Tax codes", description: "Maintain output VAT and recoverable Input VAT mappings.", href: `/b/${businessId}/settings/tax-codes`, icon: Percent },
    { title: "Appearance", description: "Global font family and text scaling preferences.", href: `/b/${businessId}/settings/appearance`, icon: FileText },
    { title: "Document templates", description: "Customize invoice layout, branding, colors, and font. Supports React PDF (modern/classic) or custom HTML templates.", href: `/b/${businessId}/settings/document-templates`, icon: FileText },
  ];
  return (
    <div className="page-container page-medium">
      <div className="page-header"><div><h1 className="page-title">Settings</h1><p className="page-description">Business-specific accounting, access, and document presentation.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={item.title} href={item.href} className="group flex items-start gap-4 rounded-lg border border-border bg-surface-raised p-5 hover:border-border-strong">
            <span className="grid size-9 place-items-center rounded-md bg-accent text-accent-foreground"><item.icon className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="font-semibold">{item.title}</span><span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.description}</span></span>
            <ArrowRight className="mt-2 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
