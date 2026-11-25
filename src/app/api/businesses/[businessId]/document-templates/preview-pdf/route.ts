import { NextResponse } from "next/server";
import { requireApiAuth } from "@/core/auth/api-auth";
import { formatMajorMoney } from "@/core/format";
import { renderDocumentPdf } from "@/modules/document-templates/template-registry";
import { getBusinessProfile } from "@/modules/business-profile/business-profile-service";
import { templateSettingsSchema } from "@/modules/document-templates/template-settings";
import type { DocumentTemplateData } from "@/modules/document-templates/types";

export const runtime = "nodejs";

function getSampleData(
  documentType: string,
  businessName: string,
  profile: ReturnType<typeof getBusinessProfile>,
  currency = "AED",
): DocumentTemplateData & { invoiceTitle: string; customerLabel: string } {
  const titleMap: Record<string, string> = {
    "sales-invoice": "INVOICE",
    "sales-quote": "SALES QUOTE",
    "sales-order": "SALES ORDER",
    "sales-credit-note": "CREDIT NOTE",
    "purchase-quote": "PURCHASE QUOTE",
    "purchase-order": "PURCHASE ORDER",
    "purchase-invoice": "PURCHASE INVOICE",
    "debit-note": "DEBIT NOTE",
    "goods-receipt": "GOODS RECEIPT",
    "delivery-note": "DELIVERY NOTE",
  };

  const partyLabelMap: Record<string, string> = {
    "sales-invoice": "BILL TO",
    "sales-quote": "QUOTE FOR",
    "sales-order": "ORDER FOR",
    "sales-credit-note": "CREDIT TO",
    "purchase-quote": "SUPPLIER",
    "purchase-order": "SUPPLIER",
    "purchase-invoice": "SUPPLIER",
    "debit-note": "SUPPLIER",
    "goods-receipt": "SUPPLIER",
    "delivery-note": "DELIVER TO",
  };

  const title = titleMap[documentType] || "DOCUMENT";
  const partyLabel = partyLabelMap[documentType] || "BILL TO";

  let companyName = businessName;
  let companyAddress: string | undefined = undefined;
  let sellerTrn: string | undefined = undefined;
  let logoUrl: string | undefined = undefined;
  let companyEmail: string | undefined = undefined;
  let companyPhone: string | undefined = undefined;

  if (profile) {
    if (profile.tradingName || profile.legalName) {
      companyName = profile.tradingName || profile.legalName;
    }
    const addr = [profile.addressLine1, profile.addressLine2, profile.city, profile.stateOrEmirate, profile.country]
      .filter(Boolean)
      .join(", ");
    if (addr) companyAddress = addr;
    if (profile.taxId) sellerTrn = profile.taxId;
    if (profile.logoUrl) logoUrl = profile.logoUrl;
    if (profile.email) companyEmail = profile.email;
    if (profile.phone) companyPhone = profile.phone;
  }

  return {
    companyName,
    companyAddress: companyAddress || "Suite 401, Business Tower, Downtown, Dubai, UAE",
    companyEmail: companyEmail || "billing@example.com",
    companyPhone: companyPhone || "+971 4 123 4567",
    sellerTrn: sellerTrn || "100234567800003",
    logoUrl,
    invoiceTitle: title,
    customerLabel: partyLabel,
    invoiceNumber: "DOC-2026-0042",
    invoiceDate: "24 Aug 2026",
    dueDate: "Due: 23 Sep 2026",
    customerName: "Apex Global Technologies LLC",
    customerAddress: "Office 12, Tech Park, Media City, Dubai",
    customerTrn: "100987654300003",
    customerEmail: "accounts@apexglobal.example",
    lines: [
      { description: "Cloud ERP Implementation & Architecture Setup", quantity: "1", unitPrice: formatMajorMoney("12500", currency), amount: formatMajorMoney("12500", currency), discount: "5%", tax: formatMajorMoney("593.75", currency) },
      { description: "Financial Chart of Accounts & UAE VAT Configuration", quantity: "1", unitPrice: formatMajorMoney("4200", currency), amount: formatMajorMoney("4200", currency), tax: formatMajorMoney("210", currency) },
      { description: "Dedicated Systems Engineering & Workflow Training", quantity: "15 hrs", unitPrice: formatMajorMoney("350", currency), amount: formatMajorMoney("5250", currency), tax: formatMajorMoney("262.5", currency) },
    ],
    subtotal: formatMajorMoney("21325", currency),
    tax: formatMajorMoney("1066.25", currency),
    total: formatMajorMoney("22391.25", currency),
    notes: "Thank you for your business. Prompt settlement is highly valued.",
    terms: "Payment is due within 30 days. Wire transfers should quote DOC-2026-0042 as reference.",
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const { businessId } = await params;
    const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "settings", requireAdmin: true });
    if (authError || !session || !access) return authError;

    const url = new URL(request.url);
    const documentType = url.searchParams.get("type") || "sales-invoice";
    const profile = getBusinessProfile(businessId, session.user.id);
    const sampleData = getSampleData(documentType, access.business.name, profile, access.business.currency);

    const pdfBuffer = await renderDocumentPdf(businessId, session.user.id, documentType, sampleData);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${documentType}.pdf"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    console.error("PDF Preview Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> }
) {
  try {
    const { businessId } = await params;
    const { session, access, error: authError } = await requireApiAuth(request, { businessId, module: "settings", requireAdmin: true });
    if (authError || !session || !access) return authError;

    const body = await request.json();
    const documentType = body.documentType || "sales-invoice";
    const parsedSettings = body.settings ? templateSettingsSchema.parse(body.settings) : undefined;

    const profile = getBusinessProfile(businessId, session.user.id);
    const sampleData = getSampleData(documentType, access.business.name, profile, access.business.currency);

    const pdfBuffer = await renderDocumentPdf(businessId, session.user.id, documentType, sampleData, parsedSettings);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${documentType}.pdf"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    console.error("PDF Preview POST Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
