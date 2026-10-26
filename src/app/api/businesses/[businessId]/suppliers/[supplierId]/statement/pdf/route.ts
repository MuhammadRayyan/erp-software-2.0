import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { formatDate, formatMoney } from "@/core/format";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { renderStatementPdf } from "@/modules/document-templates/template-registry";
import { getSupplier } from "@/modules/suppliers/supplier-service";
import { getSupplierStatement, getSupplierAging } from "@/modules/reports/supplier-statement-service";
import type { StatementTemplateData } from "@/modules/document-templates/react-pdf/statement-template";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; supplierId: string }> }) {
  const { businessId, supplierId } = await params;
  
  // Checking access using purchases module since statements relate to payables
  const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "purchases", action: "export" });
  if (authError || !session || !access) return authError;
  
  const supplier = getSupplier(businessId, session.user.id, supplierId);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const currency = url.searchParams.get("currency") || undefined;
  
  const rows = getSupplierStatement(businessId, session.user.id, supplierId, {
    fromDate: from,
    toDate: to,
    currencyCode: currency,
  });

  const asOfDate = to || new Date().toISOString().slice(0, 10);
  const aging = getSupplierAging(businessId, session.user.id, supplierId, asOfDate, currency);
  
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
      partyName: supplier.name,
      partyLabel: "Supplier",
      title: "SUPPLIER STATEMENT OF ACCOUNT",
      balanceLabel: "Payable Balance:",
      partyAddress: supplier.address || undefined,
      partyTrn: supplier.taxReference || undefined,
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
        "Content-Disposition": `inline; filename="Supplier-Statement-${supplier.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF generation failed" }, { status: 500 });
  }
}
