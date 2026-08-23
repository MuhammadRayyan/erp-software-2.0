import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { formatDate, formatMoney } from "@/core/format";
import { quantityMicrosToInput } from "@/modules/accounting/calculations/money";
import { renderInvoicePdf } from "@/modules/document-templates/template-registry";
import { getInvoice } from "@/modules/sales-invoices/invoice-service";
import type { InvoiceTemplateData } from "@/modules/document-templates/react-pdf/invoice-template";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; invoiceId: string }> }) {
  const { businessId, invoiceId } = await params;
  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "sales" });
  if (authError || !session || !access) return authError;
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
      customerAddress: customer.billingAddress || [customer.addressLine1, customer.city, customer.countrySubdivision].filter(Boolean).join(", ") || undefined,
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
