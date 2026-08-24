import { BackLink } from "@/components/back-link";
import Link from "next/link";
import { Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModule } from "@/core/permissions/require-module";
import { formatMoney } from "@/core/format";
import {
  emirateLabels,
  emirates,
  taxDirectionLabels,
  vatCategories,
  vatCategoryLabels,
  type Emirate,
  type VatCategory,
} from "@/modules/tax/uae-vat-config";
import { getVatDetailFilterOptions, getVatTransactionDetail } from "@/modules/tax/vat-report-service";
import { SelectNative } from "@/components/ui/select-native";


function sourceHref(businessId: string, type: string, id: string) {
  if (type.startsWith("sales_invoice")) return `/b/${businessId}/sales/invoices/${id}`;
  if (type.startsWith("sales_credit_note")) return `/b/${businessId}/sales/credit-notes/${id}`;
  if (type.startsWith("purchase_invoice")) return `/b/${businessId}/purchases/invoices/${id}`;
  if (type.startsWith("bank_transaction")) return `/b/${businessId}/banking/transactions/${id}`;
  return "#";
}

export default async function VatTransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "reports");
  const rows = getVatTransactionDetail(businessId, user.id, query);
  const options = getVatDetailFilterOptions(businessId, user.id);
  const detailQuery = new URLSearchParams(
    Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  const backHref = query.periodId
    ? `/b/${businessId}/tax/vat/periods/${query.periodId}`
    : `/b/${businessId}/reports`;

  return <div className="page-container">
    <BackLink href={backHref}>Back</BackLink>
    <div className="page-header">
      <div>
        <h1 className="page-title">VAT Transaction Detail</h1>
        <p className="page-description">Posted source tax detail with preserved classifications and drill-down totals.</p>
      </div>
      <Button asChild variant="secondary" size="sm">
        <a href={`/api/businesses/${businessId}/tax/vat/export?type=detail&${detailQuery}`}>
          <Download className="size-4" /> Export CSV
        </a>
      </Button>
    </div>

    <form method="get" className="mb-5 rounded-lg border border-border bg-surface-raised p-4">
      {query.bucket && <input type="hidden" name="bucket" value={query.bucket} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="periodId">VAT period</Label><SelectNative id="periodId" name="periodId"  defaultValue={query.periodId ?? ""}><option value="">Custom / all dates</option>{options.periods.map((period) => <option key={period.id} value={period.id}>{period.period_reference}</option>)}</SelectNative></div>
        <div className="space-y-1"><Label htmlFor="dateFrom">Tax date from</Label><Input id="dateFrom" name="dateFrom" type="date" defaultValue={query.dateFrom ?? ""} /></div>
        <div className="space-y-1"><Label htmlFor="dateTo">Tax date to</Label><Input id="dateTo" name="dateTo" type="date" defaultValue={query.dateTo ?? ""} /></div>
        <div className="space-y-1"><Label htmlFor="taxCodeId">Tax code</Label><SelectNative id="taxCodeId" name="taxCodeId"  defaultValue={query.taxCodeId ?? ""}><option value="">All tax codes</option>{options.taxCodes.map((code) => <option key={code.id} value={code.id}>{code.name}</option>)}</SelectNative></div>
        <div className="space-y-1"><Label htmlFor="category">Category</Label><SelectNative id="category" name="category"  defaultValue={query.category ?? ""}><option value="">All categories</option>{vatCategories.map((category) => <option key={category} value={category}>{vatCategoryLabels[category]}</option>)}</SelectNative></div>
        <div className="space-y-1"><Label htmlFor="direction">Direction</Label><SelectNative id="direction" name="direction"  defaultValue={query.direction ?? ""}><option value="">Sales and Purchases</option>{(["sales", "purchases"] as const).map((direction) => <option key={direction} value={direction}>{taxDirectionLabels[direction]}</option>)}</SelectNative></div>
        <div className="space-y-1"><Label htmlFor="emirate">Supply Emirate</Label><SelectNative id="emirate" name="emirate"  defaultValue={query.emirate ?? ""}><option value="">All Emirates</option>{emirates.map((emirate) => <option key={emirate} value={emirate}>{emirateLabels[emirate]}</option>)}</SelectNative></div>
        <div className="space-y-1"><Label htmlFor="sourceType">Source type</Label><SelectNative id="sourceType" name="sourceType"  defaultValue={query.sourceType ?? ""}><option value="">All sources</option><option value="sales_invoice">Sales Invoice</option><option value="sales_credit_note">Sales Credit Note</option><option value="purchase_invoice">Purchase Invoice</option><option value="bank_transaction">Bank Transaction</option></SelectNative></div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label htmlFor="party">Customer / Supplier</Label><Input id="party" name="party" defaultValue={query.party ?? ""} placeholder="Search party name" /></div>
        <div className="flex items-end gap-2"><Button type="submit" className="flex-1"><Search className="size-4" /> Apply filters</Button><Button asChild type="button" variant="ghost"><Link href={`/b/${businessId}/reports/vat-transactions`}><X className="size-4" /> Clear</Link></Button></div>
      </div>
    </form>

    <div className="data-panel overflow-x-auto">
      <table className="data-table min-w-[1120px]">
        <thead><tr><th>Tax date</th><th>Document</th><th>Party</th><th>Tax code</th><th>Category</th><th>Emirate</th><th className="text-right!">Net</th><th className="text-right!">VAT</th><th className="text-right!">Recoverable</th></tr></thead>
        <tbody>{rows.length ? rows.map((row) => <tr key={row.id}>
          <td>{row.tax_date}</td>
          <td className="font-medium"><Link className="text-primary hover:underline" href={sourceHref(businessId, row.source_type, row.source_id)}>{row.source_number}</Link></td>
          <td>{row.party_name ?? "—"}</td>
          <td>{row.tax_code_name}</td>
          <td>{vatCategoryLabels[row.vat_category as VatCategory] ?? row.vat_category.replaceAll("_", " ")}</td>
          <td>{row.supply_emirate ? emirateLabels[row.supply_emirate as Emirate] : "—"}</td>
          <td className="money text-right">{formatMoney(row.net_amount_minor, access.business.currency)}</td>
          <td className="money text-right">{formatMoney(row.vat_amount_minor, access.business.currency)}</td>
          <td className="money text-right">{formatMoney(row.recoverable_vat_minor, access.business.currency)}</td>
        </tr>) : <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No posted tax-detail rows match these filters.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
