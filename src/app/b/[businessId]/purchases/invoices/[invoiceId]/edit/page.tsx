import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getExpenseAccountOptions } from "@/modules/accounting/services/account-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { PurchaseInvoiceForm } from "@/modules/purchase-invoices/purchase-invoice-form";
import { getPurchaseInvoice } from "@/modules/purchase-invoices/purchase-invoice-service";
import { listPurchaseOrders } from "@/modules/purchase-orders/purchase-order-service";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function EditPurchaseInvoicePage({ params }: { params: Promise<{ businessId: string; invoiceId: string }> }) {
  const { businessId, invoiceId } = await params;
  const { user, access } = await requireModule(businessId, "purchases");
  const record = getPurchaseInvoice(businessId, user.id, invoiceId);
  if (!record || record.invoice.documentStatus === "void") notFound();
  const suppliers = listActiveSuppliers(businessId, user.id);
  const accounts = getExpenseAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory && ["purchases", "both"].includes(code.direction));
  const orders = listPurchaseOrders(businessId, user.id).filter((order) => order.status !== "cancelled");
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const minorUnit = currencySettings.currencies.find((currency) => currency.code === record.invoice.currencyCode)?.minor_unit ?? 2;
  return <div className="page-container max-w-[1320px]"><Link href={`/b/${businessId}/purchases/invoices/${invoiceId}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {record.invoice.internalNumber}</Link><div className="mb-7"><h1 className="page-title">Edit Purchase Invoice</h1><p className="page-description">{record.invoice.documentStatus === "posted" ? "Financial changes rebuild the AP journal and VAT tax detail atomically." : "Update the draft, or post it when ready."}</p></div><PurchaseInvoiceForm businessId={businessId} invoiceId={invoiceId} documentStatus={record.invoice.documentStatus} suppliers={suppliers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))} expenseAccounts={accounts.map(({ id, code, name }) => ({ id, code, name }))} taxCodes={taxes.map(({ id, name, rateBasisPoints, vatCategory }) => ({ id, name, rateBasisPoints, vatCategory }))} orders={orders.map((order) => ({ id: order.id, orderNumber: order.order_number, supplierId: order.supplier_id }))} projects={projects} items={items.map(({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }) => ({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }))} currency={access.business.currency} currencies={currencySettings.currencies.filter((currency) => currency.is_active || currency.code === record.invoice.currencyCode).map((currency) => ({ code: currency.code, name: currency.name, minorUnit: currency.minor_unit }))} rates={currencySettings.rates.map((rate) => ({ id: rate.id, currencyCode: rate.currency_code, rateDate: rate.rate_date, rateToBase: rate.rate_to_base, source: rate.source, sourceReference: rate.source_reference }))} initial={{ currencyCode: record.invoice.currencyCode, exchangeRateToBase: record.invoice.exchangeRateToBase, exchangeRateDate: record.invoice.exchangeRateDate, exchangeRateSource: record.invoice.exchangeRateSource as "Base" | "Manual" | "CBUAE", supplierId: record.invoice.supplierId, projectId: record.invoice.projectId ?? "", supplierInvoiceNumber: record.invoice.supplierInvoiceNumber, invoiceDate: record.invoice.invoiceDate, taxDate: record.invoice.taxDate, dueDate: record.invoice.dueDate, reference: record.invoice.reference ?? "", purchaseOrderId: record.invoice.purchaseOrderId ?? "", lines: record.lines.map((line) => ({ itemId: line.itemId ?? "", description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, minorUnit), expenseAccountId: line.expenseAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" })) }} /></div>;
}
