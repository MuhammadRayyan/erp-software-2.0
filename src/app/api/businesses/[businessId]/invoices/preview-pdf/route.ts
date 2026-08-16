import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { requireModule } from "@/core/permissions/require-module";
import { renderInvoicePdf } from "@/modules/document-templates/template-registry";
import type { InvoiceTemplateData } from "@/modules/document-templates/react-pdf/invoice-template";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });
    const { businessId } = await params;
    await requireModule(businessId, "settings");

    const sampleData: InvoiceTemplateData = {
      companyName: "Acme Corporation",
      invoiceNumber: "INV-2026-0001",
      invoiceDate: "Aug 16, 2026",
      dueDate: "Sep 15, 2026",
      customerName: "Globex Inc.",
      customerAddress: "123 Main St, Springfield",
      customerTrn: "1234567890",
      lines: [
        { description: "Software Development Services (August)", quantity: "1", unitPrice: "$5,000.00", amount: "$5,000.00" },
        { description: "Server Hosting", quantity: "1", unitPrice: "$250.00", amount: "$250.00" },
        { description: "Consulting (Hourly)", quantity: "10", unitPrice: "$150.00", amount: "$1,500.00" },
      ],
      subtotal: "$6,750.00",
      tax: "$337.50",
      total: "$7,087.50",
    };

    const pdfBuffer = await renderInvoicePdf(businessId, session.user.id, sampleData);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="preview.pdf"',
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    console.error("PDF Preview Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
