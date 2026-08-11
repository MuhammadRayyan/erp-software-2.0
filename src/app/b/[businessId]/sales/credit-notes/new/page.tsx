import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getSalesAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listCustomers } from "@/modules/customers/customer-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { CreditNoteForm } from "@/modules/sales-credit-notes/credit-note-form";
import { getInvoice, listInvoices } from "@/modules/sales-invoices/invoice-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function NewCreditNotePage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ invoiceId?: string; customerId?: string }> }) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "sales");
  const customers = listCustomers(businessId, user.id);
  const invoices = listInvoices(businessId, user.id).filter((invoice) => invoice.documentStatus === "posted" && invoice.balanceMinor > 0);
  const source = query.invoiceId ? getInvoice(businessId, user.id, query.invoiceId) : null;
  const selected = source && source.invoice.documentStatus === "posted" && source.balanceMinor > 0 ? source : null;
  const accounts = getSalesAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory && ["sales", "both"].includes(code.direction));
  const projects = listProjectOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const minorUnits = new Map(currencySettings.currencies.map((currency) => [currency.code, currency.minor_unit]));
  const defaultTax = taxes.find((tax) => tax.rateBasisPoints === 500)?.id ?? taxes[0]?.id ?? "";
  const lines = selected
    ? selected.lines.map((line) => ({ description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnits.get(selected.invoice.currencyCode) ?? 2), salesAccountId: line.salesAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" }))
    : [{ description: "", quantity: "1", unitPrice: "0.00", salesAccountId: accounts[0]?.id ?? "", taxCodeId: defaultTax, projectId: "" }];
  return <div className="page-container max-w-[1320px]"><Link href={selected ? `/b/${businessId}/sales/invoices/${selected.invoice.id}` : `/b/${businessId}/sales/credit-notes`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {selected?.invoice.invoiceNumber ?? "Sales Credit Notes"}</Link><div className="mb-7"><h1 className="page-title">New Sales Credit Note</h1><p className="page-description">Save a draft or post a balanced Sales and Accounts Receivable reversal.</p></div><CreditNoteForm businessId={businessId} customers={customers.map(({ id, name }) => ({ id, name }))} invoices={invoices.map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId, balanceMinor: invoice.balanceMinor, currencyCode: invoice.currencyCode, minorUnit: minorUnits.get(invoice.currencyCode) ?? 2, exchangeRateToBase: invoice.exchangeRateToBase, exchangeRateDate: invoice.exchangeRateDate, exchangeRateSource: invoice.exchangeRateSource }))} salesAccounts={accounts.map(({ id, code, name }) => ({ id, code, name }))} taxCodes={taxes.map(({ id, name, rateBasisPoints }) => ({ id, name, rateBasisPoints }))} projects={projects.map((project) => ({ id: project.id, code: project.code, name: project.name, customerId: project.customer_id }))} currency={access.business.currency} initial={{ currencyCode: selected?.invoice.currencyCode ?? access.business.currency, exchangeRateToBase: selected?.invoice.exchangeRateToBase ?? "1", exchangeRateDate: selected?.invoice.exchangeRateDate ?? new Date().toISOString().slice(0, 10), exchangeRateSource: (selected?.invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE") ?? "Base", customerId: selected?.invoice.customerId ?? (customers.some((customer) => customer.id === query.customerId) ? query.customerId! : ""), projectId: selected?.invoice.projectId ?? "", sourceInvoiceId: selected?.invoice.id ?? "", date: new Date().toISOString().slice(0, 10), taxDate: selected?.invoice.taxDate ?? new Date().toISOString().slice(0, 10), supplyEmirate: selected?.invoice.supplyEmirate ?? "", reference: selected?.invoice.invoiceNumber ?? "", reason: "", lines }} /></div>;
}
