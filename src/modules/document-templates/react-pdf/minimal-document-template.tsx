/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { minimalStyles as styles, getLogoDimensions, getFontScale } from "./primitives";
import type { TemplateSettings } from "../template-settings";
import type { DocumentTemplateData, DocumentTemplateVariant } from "./modern-document-template";

const localStyles = StyleSheet.create({
  ...styles,
  invoiceTitle: { fontSize: 18, fontWeight: "heavy", letterSpacing: 1.5, textTransform: "uppercase" },
  partyName: { fontSize: 11, fontWeight: "heavy", color: "#18181b" },
});

export function MinimalDocumentTemplate({ data, settings, variant }: { data: DocumentTemplateData; settings: TemplateSettings; variant: DocumentTemplateVariant }) {
  const primaryColor = settings.primaryColor || "#18181b";
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
      <Page size="A4" style={[localStyles.page, { fontFamily: settings.fontName, fontSize: fontScale.body }]}>
        {/* Optional Watermark */}
        {watermark && (
          <View style={{ position: "absolute", top: 280, left: 40, right: 40, opacity: 0.06, transform: "rotate(-32deg)", alignItems: "center" }}>
            <Text style={{ fontSize: 68, fontWeight: "heavy", color: data.status === "superseded" ? "red" : "#71717a" }}>
              {watermark}
            </Text>
          </View>
        )}

        {/* Optional Header Banner Image */}
        {settings.headerImageUrl && (
          <Image src={settings.headerImageUrl} style={{ width: "100%", height: "auto", marginBottom: 16 }} />
        )}

        {/* Header Section */}
        <View style={localStyles.header}>
          <View style={{ flex: 1 }}>
            {activeLogo && (
              <View style={{ marginBottom: 8, alignItems: settings.logoPosition === "center" ? "center" : settings.logoPosition === "right" ? "flex-end" : "flex-start" }}>
                <Image src={activeLogo} style={{ width: logoDims.width, height: logoDims.height, objectFit: "contain" }} />
              </View>
            )}
            <Text style={{ fontSize: 13, fontWeight: "heavy", color: primaryColor, letterSpacing: 0.5 }}>{data.companyName}</Text>
            {settings.showCompanyAddress !== false && data.companyAddress && (
              <Text style={{ fontSize: fontScale.subtext, color: "#71717a", maxWidth: 260, marginTop: 2 }}>{data.companyAddress}</Text>
            )}
            {settings.showCompanyTrn !== false && data.sellerTrn && (
              <Text style={{ fontSize: fontScale.subtext, color: "#71717a", marginTop: 1 }}>TRN: {data.sellerTrn}</Text>
            )}
            {data.companyEmail && (
              <Text style={{ fontSize: fontScale.subtext, color: "#71717a" }}>{data.companyEmail}</Text>
            )}
            {settings.headerText && (
              <Text style={{ fontSize: fontScale.subtext, color: "#71717a", marginTop: 2 }}>{settings.headerText}</Text>
            )}
          </View>

          <View style={{ alignItems: "flex-end", minWidth: 150 }}>
            <Text style={[localStyles.invoiceTitle, { color: primaryColor }]}>{variant.title}</Text>
            <Text style={{ fontSize: 10, fontWeight: "heavy", marginTop: 4, letterSpacing: 0.5 }}>#{data.invoiceNumber}</Text>
            <Text style={{ fontSize: fontScale.subtext, color: "#71717a", marginTop: 2 }}>{data.invoiceDate}</Text>
            {variant.showDueDate && data.dueDate && (
              <Text style={{ fontSize: fontScale.subtext, color: "#71717a", marginTop: 1 }}>{data.dueDate}</Text>
            )}
          </View>
        </View>

        {/* Party Section */}
        <View style={{ marginBottom: fontScale.gap }}>
          <Text style={localStyles.sectionTitle}>{variant.partyLabel}</Text>
          <Text style={localStyles.partyName}>{data.customerName}</Text>
          {data.customerAddress && (
            <Text style={{ fontSize: fontScale.subtext, color: "#71717a", maxWidth: 280, marginTop: 2 }}>
              {data.customerAddress}
            </Text>
          )}
          {variant.showBuyerTrn && settings.showCustomerTrn !== false && data.customerTrn && (
            <Text style={{ fontSize: fontScale.subtext, color: "#71717a", marginTop: 1 }}>TRN: {data.customerTrn}</Text>
          )}
          {data.customerEmail && (
            <Text style={{ fontSize: fontScale.subtext, color: "#71717a", marginTop: 1 }}>{data.customerEmail}</Text>
          )}
        </View>

        {/* Minimal Table */}
        <View style={localStyles.table}>
          <View style={localStyles.tableHeaderRow}>
            <Text style={[localStyles.tableCell, { flex: 4, fontWeight: "heavy", textTransform: "uppercase", fontSize: 7.5, color: "#71717a", letterSpacing: 0.5 }]}>Description</Text>
            {hasProject && <Text style={[localStyles.tableCell, { flex: 1.5, fontWeight: "heavy", textTransform: "uppercase", fontSize: 7.5, color: "#71717a", letterSpacing: 0.5 }]}>Project</Text>}
            <Text style={[localStyles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy", textTransform: "uppercase", fontSize: 7.5, color: "#71717a", letterSpacing: 0.5 }]}>Qty</Text>
            <Text style={[localStyles.tableCell, { flex: 1.4, textAlign: "right", fontWeight: "heavy", textTransform: "uppercase", fontSize: 7.5, color: "#71717a", letterSpacing: 0.5 }]}>Rate</Text>
            {hasDiscount && <Text style={[localStyles.tableCell, { flex: 1.2, textAlign: "right", fontWeight: "heavy", textTransform: "uppercase", fontSize: 7.5, color: "#71717a", letterSpacing: 0.5 }]}>Disc</Text>}
            {hasTax && <Text style={[localStyles.tableCell, { flex: 1.2, textAlign: "right", fontWeight: "heavy", textTransform: "uppercase", fontSize: 7.5, color: "#71717a", letterSpacing: 0.5 }]}>VAT</Text>}
            <Text style={[localStyles.tableCell, { flex: 1.5, textAlign: "right", fontWeight: "heavy", textTransform: "uppercase", fontSize: 7.5, color: "#71717a", letterSpacing: 0.5 }]}>Total</Text>
          </View>

          {data.lines.map((line, i) => (
            <View key={i} style={localStyles.tableRow} wrap={false}>
              <Text style={[localStyles.tableCell, { flex: 4, fontSize: fontScale.table }]}>{line.description}</Text>
              {hasProject && <Text style={[localStyles.tableCell, { flex: 1.5, fontSize: fontScale.table, color: "#71717a" }]}>{line.project || "-"}</Text>}
              <Text style={[localStyles.tableCell, { flex: 1, textAlign: "right", fontSize: fontScale.table }]}>{line.quantity}</Text>
              <Text style={[localStyles.tableCell, { flex: 1.4, textAlign: "right", fontSize: fontScale.table }]}>{line.unitPrice}</Text>
              {hasDiscount && <Text style={[localStyles.tableCell, { flex: 1.2, textAlign: "right", fontSize: fontScale.table }]}>{line.discount || "-"}</Text>}
              {hasTax && <Text style={[localStyles.tableCell, { flex: 1.2, textAlign: "right", fontSize: fontScale.table }]}>{line.tax || "-"}</Text>}
              <Text style={[localStyles.tableCell, { flex: 1.5, textAlign: "right", fontSize: fontScale.table, fontWeight: "heavy" }]}>{line.amount}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={localStyles.totals} wrap={false}>
          <View style={localStyles.totalsRow}>
            <Text style={{ color: "#71717a", fontSize: 8.5 }}>Subtotal</Text>
            <Text style={{ fontSize: 8.5 }}>{data.subtotal}</Text>
          </View>
          {variant.showTax && settings.showTaxColumn !== false && (
            <View style={localStyles.totalsRow}>
              <Text style={{ color: "#71717a", fontSize: 8.5 }}>VAT</Text>
              <Text style={{ fontSize: 8.5 }}>{data.tax}</Text>
            </View>
          )}
          <View style={[localStyles.totalsRow, { borderTopWidth: 1, borderTopColor: "#18181b", paddingTop: 4, marginTop: 4 }]}>
            <Text style={{ fontWeight: "heavy", fontSize: 10, color: primaryColor }}>{variant.totalLabel}</Text>
            <Text style={{ fontWeight: "heavy", fontSize: 10, color: primaryColor }}>{data.total}</Text>
          </View>
          {data.foreignDetail && (
            <Text style={{ fontSize: 7.5, color: "#71717a", marginTop: 4, textAlign: "right" }}>
              {data.foreignDetail}
            </Text>
          )}
        </View>

        {/* Payment Instructions */}
        {settings.showPaymentInstructions && settings.paymentInstructions && (
          <View style={{ marginTop: 14, padding: 8, borderLeftWidth: 2, borderLeftColor: primaryColor, backgroundColor: "#fafafa" }} wrap={false}>
            <Text style={[localStyles.sectionTitle, { color: primaryColor, marginBottom: 2 }]}>Payment Details</Text>
            <Text style={{ fontSize: fontScale.subtext, color: "#3f3f46" }}>{settings.paymentInstructions}</Text>
          </View>
        )}

        {/* Notes */}
        {showNotes && (
          <View style={{ marginTop: 12, padding: 8, backgroundColor: "#fafafa" }} wrap={false}>
            <Text style={[localStyles.sectionTitle, { marginBottom: 2 }]}>Notes</Text>
            <Text style={{ fontSize: fontScale.subtext, color: "#3f3f46" }}>{data.notes}</Text>
          </View>
        )}

        {/* Terms */}
        {showTerms && (
          <View style={{ marginTop: 8, padding: 8 }} wrap={false}>
            <Text style={[localStyles.sectionTitle, { marginBottom: 2 }]}>Terms</Text>
            <Text style={{ fontSize: fontScale.subtext, color: "#71717a" }}>{data.terms}</Text>
          </View>
        )}

        {/* Custom Fields */}
        {settings.showCustomFields && data.customFields && data.customFields.length > 0 && (
          <View style={{ marginTop: 10, padding: 6 }} wrap={false}>
            {data.customFields.map((field) => (
              <View key={field.name} style={{ flexDirection: "row", marginBottom: 2 }}>
                <Text style={{ flex: 1, fontSize: fontScale.subtext, color: "#71717a" }}>{field.name}</Text>
                <Text style={{ flex: 2, fontSize: fontScale.subtext, color: "#18181b" }}>{field.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Signature */}
        {settings.showSignatureBlock && (
          <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "flex-end" }} wrap={false}>
            <View style={{ alignItems: "center", minWidth: 150 }}>
              {settings.signatureImageUrl && (
                <Image src={settings.signatureImageUrl} style={{ width: 120, height: 38, objectFit: "contain", marginBottom: 4 }} />
              )}
              <View style={{ width: 150, borderBottomWidth: 0.5, borderBottomColor: "#71717a", marginBottom: 4, height: settings.signatureImageUrl ? 0 : 28 }} />
              <Text style={{ fontSize: fontScale.subtext, color: "#71717a" }}>
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
          <Text style={localStyles.footer}>{settings.footerText}</Text>
        )}

        {/* Dynamic Page Numbering */}
        {settings.showPageNumbers !== false && (
          <Text
            style={localStyles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
        )}
      </Page>
    </Document>
  );
}
