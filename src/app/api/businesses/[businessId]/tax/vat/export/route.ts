import { NextResponse } from "next/server";
import { getCurrentSession } from "@/core/auth/session";
import { canAccessModule } from "@/core/permissions/permissions";
import { getVatTransactionDetail, getVatWorkingPaper } from "@/modules/tax/vat-report-service";
import { emirateLabels, vatReportBuckets, type Emirate, type VatReportBucket } from "@/modules/tax/uae-vat-config";

export const runtime = "nodejs";

function csv(rows: (string | number | null | undefined)[][]) {
  return rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",")).join("\r\n");
}

export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { businessId } = await params;
  if (!canAccessModule(businessId, session.user.id, "reports")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "detail";
  const periodId = url.searchParams.get("periodId") ?? undefined;
  let body: string;
  let filename: string;
  if (type === "summary") {
    if (!periodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 });
    const report = getVatWorkingPaper(businessId, session.user.id, periodId);
    const rows: (string | number)[][] = [
      ["VAT Return Working Paper", report.period.period_reference],
      ["Period", `${report.period.start_date} to ${report.period.end_date}`],
      ["Due", report.period.filing_due_date],
      ["Status", report.period.status],
      [],
      ["Bucket", "Net minor", "VAT minor", "Output VAT minor", "Recoverable VAT minor", "Transactions"],
      ...vatReportBuckets.map((bucket) => {
        const value = report.buckets[bucket.id as VatReportBucket];
        return [bucket.label, value.netMinor, value.vatMinor, value.outputVatMinor, value.recoverableVatMinor, value.count];
      }),
      [],
      ["Standard-rated Sales by Emirate", "Net minor", "Output VAT minor", "Transactions"],
      ...report.emirateBreakdown.map((row) => [emirateLabels[row.emirate as Emirate], row.netMinor, row.vatMinor, row.count]),
      [],
      ["Calculated Output VAT minor", report.calculatedOutputVatMinor],
      ["Output adjustments minor", report.outputAdjustmentMinor],
      ["Return Total Output VAT minor", report.totalOutputVatMinor],
      ["Calculated Recoverable Input VAT minor", report.calculatedRecoverableVatMinor],
      ["Input adjustments minor", report.inputAdjustmentMinor],
      ["Return Total Recoverable Input VAT minor", report.totalRecoverableVatMinor],
      ["Net VAT minor", report.netVatMinor],
      ["Needs Review count", report.reviewCount],
      [],
      ["Preparation working paper only", "No FTA or EmaraTax submission is performed or claimed."],
    ];
    body = csv(rows);
    filename = `vat-working-paper-${report.period.period_reference.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
  } else {
    const filters = Object.fromEntries(url.searchParams.entries());
    const rows = getVatTransactionDetail(businessId, session.user.id, filters);
    body = csv([
      ["Tax Date", "Document", "Source Type", "Party", "Tax Code", "Category", "Direction", "Emirate", "Net Minor", "VAT Minor", "Output VAT Minor", "Recoverable VAT Minor"],
      ...rows.map((row) => [row.tax_date, row.source_number, row.source_type, row.party_name, row.tax_code_name, row.vat_category, row.direction, row.supply_emirate ? emirateLabels[row.supply_emirate] : "", row.net_amount_minor, row.vat_amount_minor, row.output_vat_minor, row.recoverable_vat_minor]),
    ]);
    filename = "vat-transaction-detail.csv";
  }
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
