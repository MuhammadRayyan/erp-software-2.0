/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { classicStyles as styles, colors, getLogoDimensions, getFontScale } from "./primitives";
import type { TemplateSettings } from "../template-settings";
import type { DocumentTemplateData, DocumentTemplateVariant } from "./modern-document-template";

export function ClassicDocumentTemplate({ data, settings, variant }: { data: DocumentTemplateData; settings: TemplateSettings; variant: DocumentTemplateVariant }) {
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
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {activeLogo && (
              <View style={{ marginBottom: 8, alignItems: settings.logoPosition === "center" ? "center" : settings.logoPosition === "right" ? "flex-end" : "flex-start" }}>
                <Image src={activeLogo} style={{ width: logoDims.width, height: logoDims.height, objectFit: "contain" }} />
              </View>
            )}
            <Text style={{ fontSize: 14, color: primaryColor, fontWeight: "heavy" }}>{data.companyName}</Text>
            {settings.showCompanyAddress !== false && data.companyAddress && (
              <Text style={{ fontSize: fontScale.subtext, color: colors.muted, marginTop: 2, maxWidth: 240 }}>{data.companyAddress}</Text>
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

          <View style={styles.boxedDetails}>
            <Text style={{ fontSize: 16, fontWeight: "heavy", color: primaryColor, marginBottom: 6, textAlign: "center" }}>
              {variant.title}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={{ fontSize: 8.5, fontWeight: "heavy" }}>Number:</Text>
              <Text style={{ fontSize: 8.5 }}>{data.invoiceNumber}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
              <Text style={{ fontSize: 8.5, fontWeight: "heavy" }}>Date:</Text>
              <Text style={{ fontSize: 8.5 }}>{data.invoiceDate.replace("Invoice date: ", "").replace("Date: ", "")}</Text>
            </View>
            {variant.showDueDate && data.dueDate && (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 8.5, fontWeight: "heavy" }}>Due Date:</Text>
                <Text style={{ fontSize: 8.5 }}>{data.dueDate.replace("Due date: ", "")}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Party Section */}
        <View style={{ marginBottom: fontScale.gap }}>
          <Text style={styles.sectionTitle}>{variant.partyLabel}</Text>
          <Text style={{ fontSize: 11, fontWeight: "heavy", marginBottom: 2 }}>{data.customerName}</Text>
          {data.customerAddress && <Text style={{ fontSize: fontScale.subtext, color: colors.text, marginBottom: 2, maxWidth: 280 }}>{data.customerAddress}</Text>}
          {variant.showBuyerTrn && settings.showCustomerTrn !== false && data.customerTrn && (
            <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>TRN: {data.customerTrn}</Text>
          )}
          {data.customerEmail && (
            <Text style={{ fontSize: fontScale.subtext, color: colors.muted }}>{data.customerEmail}</Text>
          )}
        </View>

        {/* Table */}
        {data.lines.length > 0 && (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCell, { flex: 4, fontWeight: "heavy" }]}>Description</Text>
              {hasProject && <Text style={[styles.tableCell, { flex: 1.5, fontWeight: "heavy" }]}>Project</Text>}
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>Qty</Text>
              <Text style={[styles.tableCell, { flex: 1.4, textAlign: "right", fontWeight: "heavy" }]}>Rate</Text>
              {hasDiscount && <Text style={[styles.tableCell, { flex: 1.2, textAlign: "right", fontWeight: "heavy" }]}>Discount</Text>}
              {hasTax && <Text style={[styles.tableCell, { flex: 1.2, textAlign: "right", fontWeight: "heavy" }]}>Tax</Text>}
              <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right", fontWeight: "heavy" }]}>Amount</Text>
            </View>
            {data.lines.map((line, i) => (
              <View key={i} style={styles.tableRow} wrap={false}>
                <Text style={[styles.tableCell, { flex: 4, fontSize: fontScale.table }]}>{line.description}</Text>
                {hasProject && <Text style={[styles.tableCell, { flex: 1.5, fontSize: fontScale.table, color: colors.muted }]}>{line.project || "-"}</Text>}
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontSize: fontScale.table }]}>{line.quantity}</Text>
                <Text style={[styles.tableCell, { flex: 1.4, textAlign: "right", fontSize: fontScale.table }]}>{line.unitPrice}</Text>
                {hasDiscount && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontSize: fontScale.table }]}>{line.discount || "-"}</Text>}
                {hasTax && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontSize: fontScale.table }]}>{line.tax || "-"}</Text>}
                <Text style={[styles.tableCell, { flex: 1.5, textAlign: "right", fontSize: fontScale.table }]}>{line.amount}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Totals */}
        <View style={styles.totals} wrap={false}>
          <View style={[styles.boxedDetails, { minWidth: 240, padding: 0 }]}>
            <View style={[styles.totalsRow, { paddingHorizontal: 10, paddingTop: 8, width: "100%", borderBottomWidth: 0 }]}>
              <Text style={{ color: colors.text, fontWeight: "heavy" }}>Subtotal</Text>
              <Text>{data.subtotal}</Text>
            </View>
            {variant.showTax && settings.showTaxColumn !== false && (
              <View style={[styles.totalsRow, { paddingHorizontal: 10, width: "100%", borderBottomWidth: 0 }]}>
                <Text style={{ color: colors.text, fontWeight: "heavy" }}>VAT</Text>
                <Text>{data.tax}</Text>
              </View>
            )}
            <View style={[styles.totalsRow, { paddingHorizontal: 10, paddingBottom: 8, width: "100%", borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: colors.borderStrong, marginTop: 4, paddingTop: 6 }]}>
              <Text style={{ fontWeight: "heavy", fontSize: 11, color: primaryColor }}>{variant.totalLabel}</Text>
              <Text style={{ fontWeight: "heavy", fontSize: 11, color: primaryColor }}>{data.total}</Text>
            </View>
          </View>
          {data.foreignDetail && (
            <Text style={{ fontSize: 7.5, color: colors.muted, marginTop: 6, textAlign: "right" }}>
              {data.foreignDetail}
            </Text>
          )}
        </View>

        {/* Payment Instructions */}
        {settings.showPaymentInstructions && settings.paymentInstructions && (
          <View style={{ marginTop: 14, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }} wrap={false}>
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 8.5, fontWeight: "heavy", textTransform: "uppercase", color: primaryColor }}>Payment & Bank Details</Text>
            </View>
            <View style={{ padding: 8 }}>
              <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{settings.paymentInstructions}</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        {showNotes && (
          <View style={{ marginTop: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }} wrap={false}>
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 8.5, fontWeight: "heavy", textTransform: "uppercase" }}>Notes / Remarks</Text>
            </View>
            <View style={{ padding: 6 }}>
              <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{data.notes}</Text>
            </View>
          </View>
        )}

        {/* Terms */}
        {showTerms && (
          <View style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }} wrap={false}>
            <View style={{ borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 8, fontWeight: "heavy", textTransform: "uppercase" }}>Terms & Conditions</Text>
            </View>
            <View style={{ padding: 6 }}>
              <Text style={{ fontSize: fontScale.subtext, color: colors.muted }}>{data.terms}</Text>
            </View>
          </View>
        )}

        {/* Custom Fields */}
        {settings.showCustomFields && data.customFields && data.customFields.length > 0 && (
          <View style={{ marginTop: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }} wrap={false}>
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.borderStrong, backgroundColor: colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 8.5, fontWeight: "heavy", textTransform: "uppercase" }}>Additional Information</Text>
            </View>
            {data.customFields.map((field) => (
              <View key={field.name} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                <Text style={{ flex: 1, fontSize: fontScale.subtext, fontWeight: "heavy", padding: 5, borderRightWidth: 0.5, borderRightColor: colors.border }}>
                  {field.name}
                </Text>
                <Text style={{ flex: 2, fontSize: fontScale.subtext, padding: 5 }}>{field.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Signature Block */}
        {settings.showSignatureBlock && (
          <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "flex-end" }} wrap={false}>
            <View style={{ alignItems: "center", minWidth: 160, borderWidth: 1, borderColor: colors.borderStrong, padding: 8, backgroundColor: colors.surface }}>
              {settings.signatureImageUrl && (
                <Image src={settings.signatureImageUrl} style={{ width: 120, height: 38, objectFit: "contain", marginBottom: 4 }} />
              )}
              <View style={{ width: 140, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, marginBottom: 4, height: settings.signatureImageUrl ? 0 : 30 }} />
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
            style={{ position: "absolute", bottom: 12, right: 40, fontSize: 7.5, color: colors.muted }}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            fixed
          />
        )}
      </Page>
    </Document>
  );
}
