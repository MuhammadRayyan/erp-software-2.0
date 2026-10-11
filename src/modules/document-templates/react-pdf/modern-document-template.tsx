import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { sharedStyles, colors, getLogoDimensions, getFontScale } from "./primitives";
import type { TemplateSettings } from "../template-settings";

export interface DocumentTemplateData {
  companyName: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyWebsite?: string;
  sellerTrn?: string;
  logoUrl?: string;
  invoiceTitle: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  customerLabel?: string;
  customerName: string;
  customerAddress?: string;
  customerTrn?: string;
  customerEmail?: string;
  customerPhone?: string;
  lines: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    discount?: string;
    tax?: string;
    project?: string;
  }>;
  subtotal: string;
  tax: string;
  total: string;
  notes?: string;
  terms?: string;
  foreignDetail?: string;
  customFields?: Array<{ name: string; value: string }>;
  status?: string;
}

export type DocumentTemplateVariant = {
  title: string;
  partyLabel: string;
  showDueDate: boolean;
  showBuyerTrn: boolean;
  totalLabel: string;
  showTax: boolean;
};

const styles = StyleSheet.create({
  ...sharedStyles,
  invoiceTitle: { fontSize: 22, fontWeight: "heavy", letterSpacing: 0.5 },
  customerName: { fontSize: 11, fontWeight: "heavy" },
});

export function ModernDocumentTemplate({ data, settings, variant }: { data: DocumentTemplateData; settings: TemplateSettings; variant: DocumentTemplateVariant }) {
  const primaryColor = settings.primaryColor || colors.text;
  const activeLogo = settings.logoUrl || data.logoUrl;
  const logoDims = getLogoDimensions(settings.logoSize);
  const fontScale = getFontScale(settings.fontSize);
  const watermark = data.status === "superseded" ? "SUPERSEDED" : settings.watermarkText;

  const showNotes = settings.showNotes !== false && !!data.notes;
  const showTerms = settings.showPaymentTerms !== false && !!data.terms;
  const hasDiscount = settings.showDiscountColumn !== false && data.lines.some((l) => l.discount);
  const hasTax = variant.showTax && settings.showTaxColumn !== false && data.lines.some((l) => l.tax);
  const hasProject = settings.showProjectColumn && data.lines.some((l) => l.project);

  return (
    <Document>
      <Page size="A4" style={[styles.page, { fontFamily: settings.fontName, fontSize: fontScale.body }]}>
        {/* Optional Watermark */}
        {watermark && (
          <View style={{ position: "absolute", top: 280, left: 40, right: 40, opacity: 0.07, transform: "rotate(-32deg)", alignItems: "center" }}>
            <Text style={{ fontSize: 72, fontWeight: "heavy", color: data.status === "superseded" ? "red" : primaryColor }}>
              {watermark}
            </Text>
          </View>
        )}

        {/* Optional Header Banner Image */}
        {settings.headerImageUrl && (
          <Image src={settings.headerImageUrl} style={{ width: "100%", height: "auto", marginBottom: 16 }} />
        )}

        {/* Header Section */}
        <View style={[styles.header, { marginBottom: fontScale.gap }]}>
          <View style={{ flex: 1 }}>
            {activeLogo && (
              <View style={{ marginBottom: 6, alignItems: settings.logoPosition === "center" ? "center" : settings.logoPosition === "right" ? "flex-end" : "flex-start" }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={activeLogo} style={{ width: logoDims.width, height: logoDims.height, objectFit: "contain" }} />
              </View>
            )}
            <Text style={{ fontSize: 13, color: primaryColor, fontWeight: "heavy" }}>{data.companyName}</Text>
            {settings.showCompanyAddress !== false && data.companyAddress && (
              <Text style={{ fontSize: fontScale.subtext, color: colors.muted, maxWidth: 260, marginTop: 2 }}>{data.companyAddress}</Text>
            )}
            {settings.showCompanyTrn !== false && data.sellerTrn && (
              <Text style={{ fontSize: fontScale.subtext, color: colors.muted, marginTop: 1 }}>TRN: {data.sellerTrn}</Text>
            )}
            {data.companyEmail && (
              <Text style={{ fontSize: fontScale.subtext, color: colors.muted }}>{data.companyEmail}</Text>
            )}
            {settings.headerText && (
              <Text style={{ fontSize: fontScale.subtext, color: colors.muted, marginTop: 2 }}>{settings.headerText}</Text>
            )}
          </View>

          <View style={{ alignItems: "flex-end", minWidth: 160 }}>
            <Text style={[styles.invoiceTitle, { color: primaryColor }]}>{variant.title}</Text>
            <Text style={{ fontSize: 11, fontWeight: "heavy", marginTop: 4 }}>{data.invoiceNumber}</Text>
            <Text style={{ fontSize: fontScale.subtext, color: colors.muted, marginTop: 2 }}>Date: {data.invoiceDate}</Text>
            {variant.showDueDate && data.dueDate && (
              <Text style={{ fontSize: fontScale.subtext, color: colors.muted, marginTop: 1 }}>{data.dueDate}</Text>
            )}
          </View>
        </View>

        {/* Customer / Party Section */}
        <View style={{ marginBottom: fontScale.gap, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
          <Text style={styles.sectionTitle}>{variant.partyLabel}</Text>
          <Text style={styles.customerName}>{data.customerName}</Text>
          {data.customerAddress && (
            <Text style={{ fontSize: fontScale.subtext, color: colors.muted, maxWidth: 280, marginTop: 2 }}>
              {data.customerAddress}
            </Text>
          )}
          {variant.showBuyerTrn && settings.showCustomerTrn !== false && data.customerTrn && (
            <Text style={{ fontSize: fontScale.subtext, color: colors.muted, marginTop: 1 }}>TRN: {data.customerTrn}</Text>
          )}
          {data.customerEmail && (
            <Text style={{ fontSize: fontScale.subtext, color: colors.muted, marginTop: 1 }}>{data.customerEmail}</Text>
          )}
        </View>

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCell, { flex: 4, fontWeight: "heavy", color: primaryColor }]}>Description</Text>
            {hasProject && <Text style={[styles.tableCell, { flex: 1.5, fontWeight: "heavy", color: primaryColor }]}>Project</Text>}
            <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy", color: primaryColor }]}>Qty</Text>
            <Text style={[styles.tableCell, { flex: 1.4, textAlign: "right", fontWeight: "heavy", color: primaryColor }]}>Rate</Text>
            {hasDiscount && <Text style={[styles.tableCell, { flex: 1.2, textAlign: "right", fontWeight: "heavy", color: primaryColor }]}>Discount</Text>}
            {hasTax && <Text style={[styles.tableCell, { flex: 1.2, textAlign: "right", fontWeight: "heavy", color: primaryColor }]}>Tax</Text>}
            <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right", fontWeight: "heavy", color: primaryColor }]}>Amount</Text>
          </View>

          {data.lines.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={[styles.tableCell, { flex: 4, fontSize: fontScale.table }]}>{line.description}</Text>
              {hasProject && <Text style={[styles.tableCell, { flex: 1.5, fontSize: fontScale.table, color: colors.muted }]}>{line.project || "-"}</Text>}
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontSize: fontScale.table }]}>{line.quantity}</Text>
              <Text style={[styles.tableCell, { flex: 1.4, textAlign: "right", fontSize: fontScale.table }]}>{line.unitPrice}</Text>
              {hasDiscount && <Text style={[styles.tableCell, { flex: 1.2, textAlign: "right", fontSize: fontScale.table }]}>{line.discount || "-"}</Text>}
              {hasTax && <Text style={[styles.tableCell, { flex: 1.2, textAlign: "right", fontSize: fontScale.table }]}>{line.tax || "-"}</Text>}
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right", fontSize: fontScale.table, fontWeight: "heavy" }]}>{line.amount}</Text>
            </View>
          ))}
        </View>

        {/* Totals Section */}
        <View style={styles.totals} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={{ color: colors.muted }}>Subtotal</Text>
            <Text>{data.subtotal}</Text>
          </View>
          {variant.showTax && settings.showTaxColumn !== false && (
            <View style={styles.totalsRow}>
              <Text style={{ color: colors.muted }}>VAT</Text>
              <Text>{data.tax}</Text>
            </View>
          )}
          <View style={[styles.totalsRow, { borderTopWidth: 1.5, borderTopColor: primaryColor, paddingTop: 6, marginTop: 4 }]}>
            <Text style={{ fontWeight: "heavy", fontSize: 11, color: primaryColor }}>{variant.totalLabel}</Text>
            <Text style={{ fontWeight: "heavy", fontSize: 11, color: primaryColor }}>{data.total}</Text>
          </View>
          {data.foreignDetail && (
            <Text style={{ fontSize: 7.5, color: colors.muted, marginTop: 6, textAlign: "right" }}>
              {data.foreignDetail}
            </Text>
          )}
        </View>

        {/* Payment & Bank Instructions */}
        {settings.showPaymentInstructions && settings.paymentInstructions && (
          <View style={{ marginTop: 14, padding: 8, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, borderRadius: 4 }} wrap={false}>
            <Text style={[styles.sectionTitle, { color: primaryColor, marginBottom: 3 }]}>Payment & Bank Details</Text>
            <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{settings.paymentInstructions}</Text>
          </View>
        )}

        {/* Notes / Remarks */}
        {showNotes && (
          <View style={{ marginTop: 12, padding: 8, backgroundColor: colors.surface, borderRadius: 4 }} wrap={false}>
            <Text style={[styles.sectionTitle, { marginBottom: 3 }]}>Notes / Remarks</Text>
            <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{data.notes}</Text>
          </View>
        )}

        {/* Terms & Conditions */}
        {showTerms && (
          <View style={{ marginTop: 10, padding: 8, backgroundColor: colors.surface, borderRadius: 4 }} wrap={false}>
            <Text style={[styles.sectionTitle, { marginBottom: 3 }]}>Terms & Conditions</Text>
            <Text style={{ fontSize: fontScale.subtext, color: colors.muted }}>{data.terms}</Text>
          </View>
        )}

        {/* Custom Fields */}
        {settings.showCustomFields && data.customFields && data.customFields.length > 0 && (
          <View style={{ marginTop: 12, padding: 8, backgroundColor: colors.surface, borderRadius: 4 }} wrap={false}>
            <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Additional Information</Text>
            {data.customFields.map((field) => (
              <View key={field.name} style={{ flexDirection: "row", marginBottom: 2 }}>
                <Text style={{ flex: 1, fontSize: fontScale.subtext, color: colors.muted }}>{field.name}</Text>
                <Text style={{ flex: 2, fontSize: fontScale.subtext, color: colors.text }}>{field.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Authorized Signature Block */}
        {settings.showSignatureBlock && (
          <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "flex-end" }} wrap={false}>
            <View style={{ alignItems: "center", minWidth: 160 }}>
              {settings.signatureImageUrl && (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={settings.signatureImageUrl} style={{ width: 120, height: 38, objectFit: "contain", marginBottom: 4 }} />
              )}
              <View style={{ width: 160, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, marginBottom: 4, height: settings.signatureImageUrl ? 0 : 30 }} />
              <Text style={{ fontSize: fontScale.subtext, fontWeight: "heavy", color: colors.muted }}>
                {settings.signatureLabel || "Authorized Signatory"}
              </Text>
            </View>
          </View>
        )}

        {/* Optional Footer Banner Image */}
        {settings.footerImageUrl && (
          <Image src={settings.footerImageUrl} style={{ width: "100%", height: "auto", marginTop: 16 }} />
        )}

        {/* Footer Text */}
        {settings.footerText && (
          <Text style={styles.footer}>{settings.footerText}</Text>
        )}

        {/* Dynamic Page Numbering */}
        {settings.showPageNumbers !== false && (
          <Text
            style={{ position: "absolute", bottom: 14, right: 40, fontSize: 7.5, color: colors.muted }}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            fixed
          />
        )}
      </Page>
    </Document>
  );
}
