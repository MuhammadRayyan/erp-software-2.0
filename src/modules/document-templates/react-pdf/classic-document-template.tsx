/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { classicStyles as styles, colors, getLogoDimensions, getFontScale } from "./primitives";
import type { TemplateSettings } from "../template-settings";
import type { DocumentTemplateData, DocumentTemplateVariant } from "../types";

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

  const shouldHideHeader = settings.letterheadMode === "preprinted" || settings.hideDigitalHeader;
  const shouldHideFooter = settings.letterheadMode === "preprinted" || settings.hideDigitalFooter;

  const pagePadding = {
    paddingTop: settings.marginTop ?? 40,
    paddingBottom: settings.marginBottom ?? 40,
    paddingLeft: settings.marginLeft ?? 40,
    paddingRight: settings.marginRight ?? 40,
  };

  const descLabel = settings.customDescriptionLabel || "Description";
  const qtyLabel = settings.customQuantityLabel || "Qty";
  const rateLabel = settings.customUnitPriceLabel || "Unit Price";
  const discLabel = settings.customDiscountLabel || "Discount";
  const taxLabel = settings.customTaxLabel || "Tax";
  const amountLabel = settings.customAmountLabel || "Amount";

  return (
    <Document>
      <Page size="A4" style={[styles.page, pagePadding, { fontFamily: settings.fontName, fontSize: fontScale.body }]}>
        {/* Optional Full-Page Background Letterhead Overlay */}
        {settings.letterheadMode === "background" && settings.letterheadBackgroundUrl && (
          <Image
            src={settings.letterheadBackgroundUrl}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
            }}
            fixed
          />
        )}

        {/* Optional Watermark */}
        {watermark && (
          <View style={{ position: "absolute", top: 280, left: 40, right: 40, opacity: 0.07, transform: "rotate(-32deg)", alignItems: "center" }}>
            <Text style={{ fontSize: 72, fontWeight: "heavy", color: data.status === "superseded" ? "red" : primaryColor }}>
              {watermark}
            </Text>
          </View>
        )}

        {/* Optional Header Banner Image */}
        {!shouldHideHeader && settings.headerImageUrl && (
          <Image src={settings.headerImageUrl} style={{ width: "100%", height: "auto", marginBottom: 16 }} />
        )}

        {/* Header Section */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {!shouldHideHeader ? (
              <>
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
              </>
            ) : null}
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
            {variant.showDueDate && data.dueDate && data.dueDate !== "-" && (
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
              <Text style={[styles.tableCell, { flex: 4, fontWeight: "heavy" }]}>{descLabel}</Text>
              {hasProject && <Text style={[styles.tableCell, { flex: 1.5, fontWeight: "heavy" }]}>Project</Text>}
              <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>{qtyLabel}</Text>
              <Text style={[styles.tableCell, { flex: 1.3, textAlign: "right", fontWeight: "heavy" }]}>{rateLabel}</Text>
              {hasDiscount && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>{discLabel}</Text>}
              {hasTax && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontWeight: "heavy" }]}>{taxLabel}</Text>}
              <Text style={[styles.tableCell, { flex: 1.4, textAlign: "right", fontWeight: "heavy" }]}>{amountLabel}</Text>
            </View>

            {data.lines.map((line, i) => (
              <View key={i} style={styles.tableRow} wrap={false}>
                <Text style={[styles.tableCell, { flex: 4, fontSize: fontScale.table }]}>{line.description}</Text>
                {hasProject && <Text style={[styles.tableCell, { flex: 1.5, fontSize: fontScale.table, color: colors.muted }]}>{line.project || "-"}</Text>}
                <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontSize: fontScale.table }]}>{line.quantity}</Text>
                <Text style={[styles.tableCell, { flex: 1.3, textAlign: "right", fontSize: fontScale.table }]}>{line.unitPrice}</Text>
                {hasDiscount && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontSize: fontScale.table }]}>{line.discount || "-"}</Text>}
                {hasTax && <Text style={[styles.tableCell, { flex: 1, textAlign: "right", fontSize: fontScale.table }]}>{line.tax || "-"}</Text>}
                <Text style={[styles.tableCell, { flex: 1.4, textAlign: "right", fontSize: fontScale.table }]}>{line.amount}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Totals Section */}
        <View style={styles.totals} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={{ fontSize: 9 }}>Subtotal</Text>
            <Text style={{ fontSize: 9 }}>{data.subtotal}</Text>
          </View>
          {variant.showTax && settings.showTaxColumn !== false && (
            <View style={styles.totalsRow}>
              <Text style={{ fontSize: 9 }}>VAT</Text>
              <Text style={{ fontSize: 9 }}>{data.tax}</Text>
            </View>
          )}
          <View style={[styles.totalsRow, { borderBottomWidth: 2, borderBottomColor: primaryColor }]}>
            <Text style={{ fontWeight: "heavy", fontSize: 10, color: primaryColor }}>{variant.totalLabel}</Text>
            <Text style={{ fontWeight: "heavy", fontSize: 10, color: primaryColor }}>{data.total}</Text>
          </View>
          {data.foreignDetail && (
            <Text style={{ fontSize: 7.5, color: colors.muted, marginTop: 4, textAlign: "right" }}>
              {data.foreignDetail}
            </Text>
          )}
        </View>

        {/* Structured Payment & Bank Remittance Box */}
        {settings.showPaymentInstructions && (
          <View style={{ marginTop: 14, padding: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong }} wrap={false}>
            <Text style={[styles.sectionTitle, { color: primaryColor, marginBottom: 4 }]}>Payment & Bank Remittance</Text>
            {(settings.bankName || settings.bankIban || settings.bankAccountNumber) && (
              <View style={{ marginBottom: 4 }}>
                {settings.bankName && (
                  <View style={{ flexDirection: "row", marginBottom: 1.5 }}>
                    <Text style={{ width: 85, fontSize: fontScale.subtext, color: colors.muted }}>Bank Name:</Text>
                    <Text style={{ fontSize: fontScale.subtext, fontWeight: "heavy", color: colors.text }}>{settings.bankName}</Text>
                  </View>
                )}
                {settings.bankAccountName && (
                  <View style={{ flexDirection: "row", marginBottom: 1.5 }}>
                    <Text style={{ width: 85, fontSize: fontScale.subtext, color: colors.muted }}>Account Name:</Text>
                    <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{settings.bankAccountName}</Text>
                  </View>
                )}
                {settings.bankAccountNumber && (
                  <View style={{ flexDirection: "row", marginBottom: 1.5 }}>
                    <Text style={{ width: 85, fontSize: fontScale.subtext, color: colors.muted }}>Account No:</Text>
                    <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{settings.bankAccountNumber}</Text>
                  </View>
                )}
                {settings.bankIban && (
                  <View style={{ flexDirection: "row", marginBottom: 1.5 }}>
                    <Text style={{ width: 85, fontSize: fontScale.subtext, color: colors.muted }}>IBAN:</Text>
                    <Text style={{ fontSize: fontScale.subtext, fontWeight: "heavy", color: colors.text }}>{settings.bankIban}</Text>
                  </View>
                )}
                {settings.bankSwiftBic && (
                  <View style={{ flexDirection: "row", marginBottom: 1.5 }}>
                    <Text style={{ width: 85, fontSize: fontScale.subtext, color: colors.muted }}>SWIFT / BIC:</Text>
                    <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{settings.bankSwiftBic}</Text>
                  </View>
                )}
              </View>
            )}
            {settings.paymentInstructions && (
              <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{settings.paymentInstructions}</Text>
            )}
          </View>
        )}

        {/* Notes */}
        {showNotes && (
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={{ fontSize: fontScale.subtext, color: colors.text }}>{data.notes}</Text>
          </View>
        )}

        {/* Terms */}
        {showTerms && (
          <View style={{ marginTop: 10 }} wrap={false}>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            <Text style={{ fontSize: fontScale.subtext, color: colors.muted }}>{data.terms}</Text>
          </View>
        )}

        {/* Custom Fields */}
        {settings.showCustomFields && data.customFields && data.customFields.length > 0 && (
          <View style={{ marginTop: 14 }} wrap={false}>
            <Text style={styles.sectionTitle}>Additional Information</Text>
            {data.customFields.map((field) => (
              <View key={field.name} style={{ flexDirection: "row", marginBottom: 2 }}>
                <Text style={{ flex: 1, fontSize: fontScale.subtext, color: colors.muted }}>{field.name}</Text>
                <Text style={{ flex: 2, fontSize: fontScale.subtext, color: colors.text }}>{field.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Single or Dual Signature Block */}
        {settings.showSignatureBlock && (
          <View style={{ marginTop: 24, flexDirection: "row", justifyContent: settings.signatureLayout === "dual" ? "space-between" : "flex-end" }} wrap={false}>
            {settings.signatureLayout === "dual" && (
              <View style={{ alignItems: "center", minWidth: 160 }}>
                {settings.secondarySignatureImageUrl && (
                  <Image src={settings.secondarySignatureImageUrl} style={{ width: 120, height: 38, objectFit: "contain", marginBottom: 4 }} />
                )}
                <View style={{ width: 160, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, marginBottom: 4, height: settings.secondarySignatureImageUrl ? 0 : 30 }} />
                <Text style={{ fontSize: fontScale.subtext, fontWeight: "heavy", color: colors.muted }}>
                  {settings.secondarySignatureLabel || "Prepared By"}
                </Text>
              </View>
            )}
            <View style={{ alignItems: "center", minWidth: 160 }}>
              {settings.signatureImageUrl && (
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
        {!shouldHideFooter && settings.footerImageUrl && (
          <Image src={settings.footerImageUrl} style={{ width: "100%", height: "auto", marginTop: 16 }} />
        )}

        {/* Footer Text */}
        {!shouldHideFooter && settings.footerText && (
          <Text style={styles.footer}>{settings.footerText}</Text>
        )}

        {/* Dynamic Page Numbering */}
        {settings.showPageNumbers !== false && (
          <Text
            style={{
              position: "absolute",
              bottom: Math.max(10, (settings.marginBottom ?? 40) - 26),
              right: settings.marginRight ?? 40,
              fontSize: 7.5,
              color: colors.muted,
            }}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            fixed
          />
        )}
      </Page>
    </Document>
  );
}
