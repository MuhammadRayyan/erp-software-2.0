import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/core/permissions/require-module";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { getExpenseAccountOptions } from "@/modules/accounting/services/account-service";
import { getAccountingSettings } from "@/modules/accounting/services/accounting-settings-service";
import { getActiveTaxCodes } from "@/modules/accounting/services/tax-code-service";
import { listProjectOptions } from "@/modules/projects/project-service";
import { PurchaseInvoiceForm } from "@/modules/purchase-invoices/purchase-invoice-form";
import { getPurchaseOrder, listPurchaseOrders } from "@/modules/purchase-orders/purchase-order-service";
import { listActiveSuppliers } from "@/modules/suppliers/supplier-service";
import { listInventoryItemOptions } from "@/modules/inventory/inventory-item-service";
import { minorToCurrencyInput } from "@/modules/currency/conversion";
import { getCurrencySettings } from "@/modules/currency/exchange-rate";

export default async function NewPurchaseInvoicePage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ supplierId?: string; orderId?: string; projectId?: string }> }) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user, access } = await requireModule(businessId, "purchases");
  const suppliers = listActiveSuppliers(businessId, user.id);
  const accounts = getExpenseAccountOptions(businessId, user.id);
  const taxes = getActiveTaxCodes(businessId, user.id).filter((code) => code.vatCategory && ["purchases", "both"].includes(code.direction));
  const settings = getAccountingSettings(businessId, user.id);
  const orders = listPurchaseOrders(businessId, user.id).filter((order) => order.status !== "cancelled");
  const projects = listProjectOptions(businessId, user.id);
  const items = listInventoryItemOptions(businessId, user.id);
  const currencySettings = getCurrencySettings(businessId, user.id);
  const sourceOrder = query.orderId ? getPurchaseOrder(businessId, user.id, query.orderId) : null;
  const today = new Date(); const due = new Date(today); due.setDate(due.getDate() + 14);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const defaultTax = taxes.find((tax) => tax.vatCategory === "standard" && tax.rateBasisPoints === 500)?.id ?? taxes[0]?.id ?? "";
  const supplierId = sourceOrder?.order.supplierId ?? (suppliers.some((supplier) => supplier.id === query.supplierId) ? query.supplierId! : "");
  const projectId = sourceOrder?.order.projectId ?? (projects.some((project) => project.id === query.projectId) ? query.projectId! : "");
  const documentCurrency = sourceOrder?.order.currencyCode ?? suppliers.find((supplier) => supplier.id === supplierId)?.defaultCurrencyCode ?? access.business.currency;
  const documentMinorUnit = currencySettings.currencies.find((currency) => currency.code === documentCurrency)?.minor_unit ?? 2;
  const lines = sourceOrder
    ? sourceOrder.lines.map((line) => ({ itemId: line.itemId ?? "", description: line.description, quantity: quantityMicrosToInput(line.quantityMicros), unitPrice: minorToCurrencyInput(line.unitPriceMinor, documentMinorUnit), expenseAccountId: line.expenseAccountId ?? settings.defaultPurchaseExpenseAccountId, taxCodeId: line.taxCodeId, projectId: line.projectId ?? "" }))
    : [{ itemId: "", description: "", quantity: "1", unitPrice: "0.00", expenseAccountId: settings.defaultPurchaseExpenseAccountId, taxCodeId: defaultTax, projectId: "" }];
  return <div className="page-container max-w-[1320px]"><Link href={sourceOrder ? `/b/${businessId}/purchases/orders/${sourceOrder.order.id}` : `/b/${businessId}/purchases/invoices`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {sourceOrder?.order.orderNumber ?? "Purchase Invoices"}</Link><div className="mb-7"><h1 className="page-title">New Purchase Invoice</h1><p className="page-description">Save a non-posting draft or post the journal and VAT tax detail atomically.</p></div><PurchaseInvoiceForm businessId={businessId} suppliers={suppliers.map(({ id, name, defaultCurrencyCode }) => ({ id, name, defaultCurrencyCode }))} expenseAccounts={accounts.map(({ id, code, name }) => ({ id, code, name }))} taxCodes={taxes.map(({ id, name, rateBasisPoints, vatCategory }) => ({ id, name, rateBasisPoints, vatCategory }))} orders={orders.map((order) => ({ id: order.id, orderNumber: order.order_number, supplierId: order.supplier_id }))} projects={projects} items={items.map(({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }) => ({ id, sku, name, purchasePriceMinor, inventoryAssetAccountId }))} currency={access.business.currency} currencies={currencySettings.currencies.filter((currency) => currency.is_active).map((currency) => ({ code: currency.code, name: currency.name, minorUnit: currency.minor_unit }))} rates={currencySettings.rates.map((rate) => ({ id: rate.id, currencyCode: rate.currency_code, rateDate: rate.rate_date, rateToBase: rate.rate_to_base, source: rate.source, sourceReference: rate.source_reference }))} initial={{ currencyCode: documentCurrency, exchangeRateToBase: documentCurrency === access.business.currency ? "1" : "", exchangeRateDate: documentCurrency === access.business.currency ? iso(today) : "", exchangeRateSource: documentCurrency === access.business.currency ? "Base" : "", supplierId, projectId, supplierInvoiceNumber: "", invoiceDate: iso(today), taxDate: iso(today), dueDate: iso(due), reference: sourceOrder?.order.orderNumber ?? "", purchaseOrderId: sourceOrder?.order.id ?? "", lines }} /></div>;
}
