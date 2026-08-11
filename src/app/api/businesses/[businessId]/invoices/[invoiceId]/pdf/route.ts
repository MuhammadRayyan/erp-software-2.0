import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { formatDate, formatMoney } from "@/core/format";
import { getDocumentPdfAccess } from "@/core/permissions/document-pdf-access";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { renderInvoicePdf } from "@/modules/document-templates/pdf-engine";
import { getInvoiceTemplate } from "@/modules/document-templates/template-service";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string; invoiceId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId, invoiceId } = await params;
  const access = getDocumentPdfAccess(businessId, session.user.id, "sales-invoice");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const record = getInvoice(businessId, session.user.id, invoiceId);
  if (!record) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  const { invoice, customer, lines } = record;
  const currency = invoice.currencyCode;
  const foreignDetail = currency === access.business.currency ? "" : ` · Rate 1 ${currency} = ${invoice.exchangeRateToBase} ${access.business.currency} (${invoice.exchangeRateSource}, ${invoice.exchangeRateDate}) · Base ${formatMoney(invoice.baseTotalMinor, access.business.currency)} · ${access.business.currency} VAT ${formatMoney(invoice.baseTaxMinor, access.business.currency)}`;
  try {
    const pdf = await renderInvoicePdf(getInvoiceTemplate(businessId, session.user.id), {
        companyName: access.business.name,
        invoiceTitle: "INVOICE",
        invoiceNumber: invoice.invoiceNumber,
        customerLabel: "BILL TO",
        customerName: customer.name,
        invoiceDate: `Invoice date: ${formatDate(invoice.invoiceDate)}`,
        dueDate: `Due date: ${formatDate(invoice.dueDate)}${foreignDetail}`,
        itemsTable: JSON.stringify(lines.map((line) => [line.description, quantityMicrosToInput(line.quantityMicros), formatMoney(line.unitPriceMinor, currency), formatMoney(line.grossAmountMinor, currency)])),
        subtotal: `Subtotal    ${formatMoney(invoice.subtotalMinor, currency)}`,
        vat: `VAT             ${formatMoney(invoice.taxMinor, currency)}`,
        total: `TOTAL        ${formatMoney(invoice.totalMinor, currency)}`,
    });
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF generation failed" }, { status: 500 });
  }
}
