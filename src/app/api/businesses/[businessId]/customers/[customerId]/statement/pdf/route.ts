import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { formatDate, formatMoney } from "@/core/format";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { renderStatementPdf } from "@/modules/document-templates/template-registry";
import { getCustomer } from "@/modules/customers/customer-service";
import { getCustomerStatement, getCustomerAging } from "@/modules/reports/customer-statement-service";
import type { StatementTemplateData } from "@/modules/document-templates/react-pdf/statement-template";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; customerId: string }> }) {
  const { businessId, customerId } = await params;
  
  // Checking access using sales module since statements relate to receivables
  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "sales" });
  if (authError || !session || !access) return authError;
  
  const customer = getCustomer(businessId, session.user.id, customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const currency = url.searchParams.get("currency") || undefined;
  
  const rows = getCustomerStatement(businessId, session.user.id, customerId, {
    fromDate: from,
    toDate: to,
    currencyCode: currency,
  });

  const asOfDate = to || new Date().toISOString().slice(0, 10);
  const aging = getCustomerAging(businessId, session.user.id, customerId, asOfDate, currency);
  
  // Calculate total outstanding from the last row's running balance, or 0 if none
  const totalOutstanding = rows.length > 0 ? rows[rows.length - 1].balanceMinor : 0;

  const periodLabel = from && to
    ? `${formatDate(from)} – ${formatDate(to)}`
    : from
      ? `From ${formatDate(from)}`
      : to
        ? `Up to ${formatDate(to)}`
        : `All Time (as of ${formatDate(asOfDate)})`;

  try {
    const data: StatementTemplateData = {
      companyName: access.business.name,
      customerName: customer.name,
      customerAddress: customer.billingAddress || [customer.addressLine1, customer.city, customer.countrySubdivision].filter(Boolean).join(", ") || undefined,
      customerTrn: customer.taxReference || undefined,
      statementDate: formatDate(asOfDate),
      fromDate: from ? formatDate(from) : undefined,
      toDate: to ? formatDate(to) : undefined,
      periodLabel,
      lines: rows.map((row) => ({
        date: formatDate(row.date),
        type: journalSourceLabel(row.source_type),
        reference: row.reference || row.entry_number,
        description: row.description,
        debit: row.debit_minor ? formatMoney(row.debit_minor, row.currency_code) : "",
        credit: row.credit_minor ? formatMoney(row.credit_minor, row.currency_code) : "",
        balance: formatMoney(row.balanceMinor, row.currency_code),
      })),
      totalOutstanding: formatMoney(totalOutstanding, aging.currencyCode),
      aging: {
        current: formatMoney(aging.currentMinor, aging.currencyCode),
        days30: formatMoney(aging.days30Minor, aging.currencyCode),
        days60: formatMoney(aging.days60Minor, aging.currencyCode),
        days90: formatMoney(aging.days90Minor, aging.currencyCode),
        days90Plus: formatMoney(aging.days90PlusMinor, aging.currencyCode),
        total: formatMoney(aging.totalMinor, aging.currencyCode),
      },
    };

    const pdf = await renderStatementPdf(businessId, session.user.id, data);
    
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Statement-${customer.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF generation failed" }, { status: 500 });
  }
}
