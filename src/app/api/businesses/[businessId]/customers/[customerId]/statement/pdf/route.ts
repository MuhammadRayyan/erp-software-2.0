import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { formatDate, formatMoney } from "@/core/format";
import { getDocumentPdfAccess } from "@/core/permissions/document-pdf-access";
import { journalSourceLabel } from "@/modules/accounting/journal-source";
import { renderStatementPdf } from "@/modules/document-templates/template-registry";
import { getCustomer } from "@/modules/customers/customer-service";
import { getCustomerStatement } from "@/modules/reports/customer-statement-service";
import type { StatementTemplateData } from "@/modules/document-templates/react-pdf/statement-template";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string; customerId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { businessId, customerId } = await params;
  
  // Checking access using sales-invoice scope since statements relate to receivables
  const access = getDocumentPdfAccess(businessId, session.user.id, "sales-invoice");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  
  const customer = getCustomer(businessId, session.user.id, customerId);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  
  const rows = getCustomerStatement(businessId, session.user.id, customerId);
  
  // Calculate total outstanding from the last row's running balance, or 0 if none
  const totalOutstanding = rows.length > 0 ? rows[rows.length - 1].balanceMinor : 0;

  try {
    const data: StatementTemplateData = {
      companyName: access.business.name,
      customerName: customer.name,
      customerAddress: customer.billingAddress || [customer.addressLine1, customer.city, customer.countrySubdivision].filter(Boolean).join(", ") || undefined,
      customerTrn: customer.taxReference || undefined,
      statementDate: formatDate(new Date().toISOString()),
      lines: rows.map((row) => ({
        date: formatDate(row.date),
        type: journalSourceLabel(row.source_type),
        reference: row.reference || row.entry_number,
        description: row.description,
        debit: row.debit_minor ? formatMoney(row.debit_minor, access.business.currency) : "",
        credit: row.credit_minor ? formatMoney(row.credit_minor, access.business.currency) : "",
        balance: formatMoney(row.balanceMinor, access.business.currency),
      })),
      totalOutstanding: formatMoney(totalOutstanding, access.business.currency),
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
