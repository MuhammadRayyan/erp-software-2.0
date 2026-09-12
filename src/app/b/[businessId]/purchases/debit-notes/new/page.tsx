import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { getExpenseAccountOptions } from "@/modules/accounting/services/account-service";
import { getAccountingSettings } from "@/modules/accounting/services/accounting-settings-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";
import { listPurchaseInvoices } from "@/modules/purchase-invoices/purchase-invoice-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { DebitNoteForm } from "@/modules/debit-notes/debit-note-form";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function NewDebitNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ supplierId?: string; invoiceId?: string; projectId?: string }>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "purchases");
  const suppliers = listActiveSuppliers(businessId, user.id);
  const expenseAccounts = getExpenseAccountOptions(businessId, user.id);
  const taxCodes = getActiveTaxCodes(businessId, user.id).filter(
    (code) => code.vatCategory && ["purchases", "both"].includes(code.direction),
  );
  const settings = getAccountingSettings(businessId, user.id);
  const projects = listProjectOptions(businessId, user.id);
  const allInvoices = listPurchaseInvoices(businessId, user.id);
  const eligibleInvoices = allInvoices.filter((inv) => inv.document_status === "posted");
  const currencySettings = getCurrencySettings(businessId, user.id);

  const selectedSupplierId = suppliers.some((s) => s.id === query.supplierId) ? query.supplierId! : "";
  const selectedProject = projects.find((p) => p.id === query.projectId);
  const documentCurrency =
    suppliers.find((s) => s.id === selectedSupplierId)?.defaultCurrencyCode ??
    access.business.currency;

  const today = new Date();
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const defaultTaxCode =
    taxCodes.find((tc) => tc.vatCategory === "standard" && tc.rateBasisPoints === 500) ??
    taxCodes[0];

  const ready = suppliers.length && expenseAccounts.length && taxCodes.length;

  return (
    <div className="page-container">
      <Link
        href={`/b/${businessId}/purchases/debit-notes`}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Debit Notes
      </Link>
      <div className="mb-7">
        <h1 className="page-title">New Debit Note</h1>
        <p className="page-description">
          Create a supplier debit note to adjust purchase totals, return goods, or correct tax.
        </p>
      </div>
      {ready ? (
        <DebitNoteForm
          businessId={businessId}
          suppliers={suppliers.map(({ id, name }) => ({ id, name }))}
          invoices={eligibleInvoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.internal_number,
            supplierId: inv.supplier_id,
            balanceMinor: inv.total_minor,
            currencyCode: inv.currency_code,
            minorUnit: 2,
            exchangeRateToBase: String(inv.exchange_rate_to_base ?? "1"),
            exchangeRateDate: inv.exchange_rate_date ?? "",
            exchangeRateSource: inv.exchange_rate_source ?? "Base",
          }))}
          salesAccounts={expenseAccounts.map(({ id, code, name }) => ({ id, code, name }))}
          taxCodes={taxCodes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))}
          projects={projects.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            supplierId: null,
          }))}
          currency={access.business.currency}
          initial={{
            currencyCode: documentCurrency,
            exchangeRateToBase: documentCurrency === access.business.currency ? "1" : "",
            exchangeRateDate: documentCurrency === access.business.currency ? iso(today) : "",
            exchangeRateSource: documentCurrency === access.business.currency ? "Base" : "",
            supplierId: selectedSupplierId,
            projectId: selectedProject?.id ?? "",
            purchaseInvoiceId: query.invoiceId ?? "",
            amountsIncludeTax: false,
            date: iso(today),
            taxDate: iso(today),
            reference: "",
            lines: [
              {
                description: "",
                quantity: "1",
                unitPrice: "0.00",
                discountType: "none",
                discountValue: "0",
                expenseAccountId: settings.defaultPurchaseExpenseAccountId,
                taxCodeId: defaultTaxCode?.id ?? "",
                projectId: "",
              },
            ],
          }}
        />
      ) : (
        <div className="max-w-xl rounded-lg border border-border bg-surface-raised p-6">
          <Truck className="size-6 text-primary" />
          <h2 className="mt-4 text-base font-semibold">Debit Note setup needs attention</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Add a supplier and ensure at least one active expense account and tax code exist.
          </p>
          <Button asChild className="mt-5">
            <Link href={`/b/${businessId}/suppliers/new`}>New Supplier</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
