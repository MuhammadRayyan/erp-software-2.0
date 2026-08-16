import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { formatDate, formatMoney } from "@/core/format";
import { getDocumentPdfAccess } from "@/core/permissions/document-pdf-access";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { renderInvoicePdf } from "@/modules/document-templates/template-registry";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";
import type { InvoiceTemplateData } from "@/modules/document-templates/react-pdf/invoice-template";

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
  const foreignDetail = currency === access.business.currency ? "" : `Rate 1 ${currency} = ${invoice.exchangeRateToBase} ${access.business.currency} (${invoice.exchangeRateSource}, ${invoice.exchangeRateDate}) · Base ${formatMoney(invoice.baseTotalMinor, access.business.currency)} · ${access.business.currency} VAT ${formatMoney(invoice.baseTaxMinor, access.business.currency)}`;
  try {
    const data: InvoiceTemplateData = {
      companyName: access.business.name,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: formatDate(invoice.invoiceDate),
      dueDate: formatDate(invoice.dueDate),
      customerName: customer.name,
      customerAddress: [customer.addressLine1, customer.city, customer.countrySubdivision].filter(Boolean).join(", ") || undefined,
      customerTrn: customer.taxReference || undefined,
      lines: lines.map((line) => ({
        description: line.description,
        quantity: quantityMicrosToInput(line.quantityMicros),
        unitPrice: formatMoney(line.unitPriceMinor, currency),
        amount: formatMoney(line.grossAmountMinor, currency),
      })),
      subtotal: formatMoney(invoice.subtotalMinor, currency),
      tax: formatMoney(invoice.taxMinor, currency),
      total: formatMoney(invoice.totalMinor, currency),
      foreignDetail: foreignDetail || undefined,
    };
    const pdf = await renderInvoicePdf(businessId, session.user.id, data);
    return new NextResponse(new Uint8Array(pdf), {
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
