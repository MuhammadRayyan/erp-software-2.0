import React from "react";
import type { DocumentTemplateData, DocumentTemplateVariant } from "../react-pdf/modern-document-template";
import type { TemplateSettings } from "../template-settings";

export interface DocumentPaperSheetProps {
  data: DocumentTemplateData;
  settings: TemplateSettings;
  variant: DocumentTemplateVariant;
  className?: string;
}

export function DocumentPaperSheet({
  data,
  settings,
  variant,
  className = "",
}: DocumentPaperSheetProps) {
  const primaryColor = settings.primaryColor || "#2563eb";
  const activeLogo = settings.logoUrl || data.logoUrl;
  const isPreprinted = settings.letterheadMode === "preprinted";
  const isBackground = settings.letterheadMode === "background";
  const shouldHideHeader = isPreprinted || settings.hideDigitalHeader;
  const shouldHideFooter = isPreprinted || settings.hideDigitalFooter;

  const showNotes = settings.showNotes !== false && Boolean(data.notes);
  const showTerms = settings.showPaymentTerms !== false && Boolean(data.terms);
  const hasDiscount = settings.showDiscountColumn !== false && data.lines.some((l) => Boolean(l.discount));
  const hasTax = variant.showTax && settings.showTaxColumn !== false && data.lines.some((l) => Boolean(l.tax));
  const hasProject = settings.showProjectColumn && data.lines.some((l) => Boolean(l.project));

  const descLabel = settings.customDescriptionLabel || "Description";
  const qtyLabel = settings.customQuantityLabel || "Qty";
  const rateLabel = settings.customUnitPriceLabel || "Unit Price";
  const discLabel = settings.customDiscountLabel || "Discount";
  const taxLabel = settings.customTaxLabel || "Tax";
  const amountLabel = settings.customAmountLabel || "Amount";

  const watermark =
    data.status === "superseded"
      ? "SUPERSEDED"
      : data.status === "void"
      ? "VOID"
      : settings.watermarkText;

  const logoDims =
    settings.logoSize === "small"
      ? { width: 80, height: 40 }
      : settings.logoSize === "large"
      ? { width: 180, height: 90 }
      : { width: 120, height: 60 };

  const fontFamilyClass = "font-sans";

  return (
    <div
      id="printable-document-sheet"
      className={`print-document-paper relative w-full max-w-[820px] min-h-[1100px] bg-white text-slate-800 shadow-2xl border border-slate-200/90 rounded-sm overflow-hidden select-text text-sm transition-all print:border-none print:shadow-none print:m-0 print:max-w-none print:w-full ${fontFamilyClass} ${className}`}
      style={{
        paddingTop: `${settings.marginTop ?? 40}pt`,
        paddingBottom: `${settings.marginBottom ?? 40}pt`,
        paddingLeft: `${settings.marginLeft ?? 40}pt`,
        paddingRight: `${settings.marginRight ?? 40}pt`,
      }}
    >
      {/* Background Letterhead Artwork Mode */}
      {isBackground && settings.letterheadBackgroundUrl && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-no-repeat pointer-events-none select-none opacity-95 print:opacity-100"
          style={{ backgroundImage: `url(${settings.letterheadBackgroundUrl})` }}
        />
      )}

      {/* Watermark */}
      {watermark && (
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
          <span
            className="text-7xl sm:text-8xl font-black uppercase tracking-widest -rotate-30 select-none opacity-10"
            style={{ color: data.status === "superseded" || data.status === "void" ? "#ef4444" : primaryColor }}
          >
            {watermark}
          </span>
        </div>
      )}

      <div className="relative z-10 flex flex-col min-h-full">
        {/* Optional Header Banner Image */}
        {!shouldHideHeader && settings.headerImageUrl && (
          <div className="mb-6 w-full overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={settings.headerImageUrl} alt="Header Banner" className="w-full h-auto object-cover" />
          </div>
        )}

        {/* Top Header Block: Branding on left, Document Title on right */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pb-6">
          <div className="flex-1 min-w-0">
            {!shouldHideHeader ? (
              <>
                {activeLogo && (
                  <div
                    className={`mb-3 flex ${
                      settings.logoPosition === "center"
                        ? "justify-center"
                        : settings.logoPosition === "right"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeLogo}
                      alt={data.companyName}
                      style={{ maxWidth: `${logoDims.width}px`, maxHeight: `${logoDims.height}px` }}
                      className="object-contain"
                    />
                  </div>
                )}
                <h1 className="text-lg font-bold tracking-tight" style={{ color: primaryColor }}>
                  {data.companyName}
                </h1>
                {settings.showCompanyAddress !== false && data.companyAddress && (
                  <p className="mt-1 text-xs text-slate-500 max-w-sm whitespace-pre-line leading-relaxed">
                    {data.companyAddress}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  {settings.showCompanyTrn !== false && data.sellerTrn && (
                    <span>TRN: <strong className="font-semibold text-slate-700">{data.sellerTrn}</strong></span>
                  )}
                  {data.companyEmail && <span>{data.companyEmail}</span>}
                  {data.companyPhone && <span>{data.companyPhone}</span>}
                  {data.companyWebsite && <span>{data.companyWebsite}</span>}
                </div>
                {settings.headerText && (
                  <p className="mt-2 text-xs text-slate-500 italic">{settings.headerText}</p>
                )}
              </>
            ) : (
              /* Pre-printed stationery placeholder for top margin offset */
              <div className="h-6" />
            )}
          </div>

          {/* Document Title & Meta Box */}
          <div className="text-left sm:text-right shrink-0 max-w-xs sm:max-w-sm">
            <h2
              className="text-2xl font-black uppercase tracking-wider break-words"
              style={{ color: primaryColor }}
            >
              {variant.title}
            </h2>
            <p className="mt-1 font-mono text-base font-bold text-slate-900 break-words">{data.invoiceNumber}</p>
            <div className="mt-2 space-y-0.5 text-xs text-slate-600">
              <p>
                <span className="text-slate-400">Date: </span>
                <span className="font-medium text-slate-800">{data.invoiceDate}</span>
              </p>
              {variant.showDueDate && data.dueDate && data.dueDate !== "-" && (
                <p className="break-words">
                  <span className="text-slate-400">
                    {/^(due|expected|delivery|expiry|invoice|account|location|paid from):/i.test(data.dueDate) ? "" : "Due: "}
                  </span>
                  <span className="font-medium text-slate-800">{data.dueDate}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Party Block (BILL TO / SUPPLIER / CLIENT) */}
        <div className="border-t border-slate-200/80 pt-4 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {variant.partyLabel}
          </p>
          <p className="mt-1 text-base font-bold text-slate-900">{data.customerName}</p>
          {data.customerAddress && (
            <p className="mt-0.5 text-xs text-slate-500 max-w-sm whitespace-pre-line leading-relaxed">
              {data.customerAddress}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
            {variant.showBuyerTrn && settings.showCustomerTrn !== false && data.customerTrn && (
              <span>TRN: <strong className="font-semibold text-slate-700">{data.customerTrn}</strong></span>
            )}
            {data.customerEmail && <span>{data.customerEmail}</span>}
            {data.customerPhone && <span>{data.customerPhone}</span>}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto my-2">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className="border-b-2"
                style={{
                  borderBottomColor: primaryColor,
                  backgroundColor: settings.templateType === "modern" ? `${primaryColor}0d` : "transparent",
                }}
              >
                <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px]" style={{ color: primaryColor }}>
                  {descLabel}
                </th>
                {hasProject && (
                  <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[11px]" style={{ color: primaryColor }}>
                    Project
                  </th>
                )}
                <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider text-[11px]" style={{ color: primaryColor }}>
                  {qtyLabel}
                </th>
                <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider text-[11px]" style={{ color: primaryColor }}>
                  {rateLabel}
                </th>
                {hasDiscount && (
                  <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider text-[11px]" style={{ color: primaryColor }}>
                    {discLabel}
                  </th>
                )}
                {hasTax && (
                  <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider text-[11px]" style={{ color: primaryColor }}>
                    {taxLabel}
                  </th>
                )}
                <th className="py-2.5 px-3 text-right font-bold uppercase tracking-wider text-[11px]" style={{ color: primaryColor }}>
                  {amountLabel}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.lines.map((line, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-3 px-3 align-top font-medium text-slate-900 leading-snug">
                    {line.description}
                  </td>
                  {hasProject && (
                    <td className="py-3 px-3 align-top text-slate-500">
                      {line.project || "—"}
                    </td>
                  )}
                  <td className="py-3 px-3 align-top text-right font-mono text-slate-700">
                    {line.quantity}
                  </td>
                  <td className="py-3 px-3 align-top text-right font-mono text-slate-700">
                    {line.unitPrice}
                  </td>
                  {hasDiscount && (
                    <td className="py-3 px-3 align-top text-right font-mono text-slate-500">
                      {line.discount || "—"}
                    </td>
                  )}
                  {hasTax && (
                    <td className="py-3 px-3 align-top text-right font-mono text-slate-500">
                      {line.tax || "—"}
                    </td>
                  )}
                  <td className="py-3 px-3 align-top text-right font-mono font-bold text-slate-900">
                    {line.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="flex justify-end pt-4 pb-6">
          <div className="w-full max-w-xs space-y-1.5 text-xs">
            <div className="flex justify-between py-1 text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono font-semibold text-slate-900">{data.subtotal}</span>
            </div>
            {variant.showTax && settings.showTaxColumn !== false && (
              <div className="flex justify-between py-1 text-slate-600">
                <span>VAT</span>
                <span className="font-mono font-semibold text-slate-900">{data.tax}</span>
              </div>
            )}
            <div
              className="flex justify-between pt-2.5 pb-1 border-t-2 text-sm font-bold"
              style={{ borderTopColor: primaryColor, color: primaryColor }}
            >
              <span>{variant.totalLabel}</span>
              <span className="font-mono text-base">{data.total}</span>
            </div>
            {data.foreignDetail && (
              <p className="pt-2 text-[10px] text-slate-500 font-medium text-right leading-tight border-t border-slate-100">
                {data.foreignDetail}
              </p>
            )}
          </div>
        </div>

        {/* Structured Bank & Remittance Box */}
        {settings.showPaymentInstructions && (
          <div className="my-3 p-4 rounded-md border border-slate-200 bg-slate-50/70 text-xs">
            <p className="font-bold uppercase tracking-wider text-[11px] mb-2" style={{ color: primaryColor }}>
              Payment & Bank Remittance
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {settings.bankName && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Bank Name:</span>
                  <span className="font-semibold text-slate-800">{settings.bankName}</span>
                </div>
              )}
              {settings.bankAccountName && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Account Name:</span>
                  <span className="font-medium text-slate-800">{settings.bankAccountName}</span>
                </div>
              )}
              {settings.bankAccountNumber && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Account No:</span>
                  <span className="font-mono text-slate-800">{settings.bankAccountNumber}</span>
                </div>
              )}
              {settings.bankIban && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">IBAN:</span>
                  <span className="font-mono font-bold text-slate-900">{settings.bankIban}</span>
                </div>
              )}
              {settings.bankSwiftBic && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">SWIFT / BIC:</span>
                  <span className="font-mono text-slate-800">{settings.bankSwiftBic}</span>
                </div>
              )}
            </div>
            {settings.paymentInstructions && (
              <p className="mt-2 text-slate-600 border-t border-slate-200/80 pt-2 whitespace-pre-line">
                {settings.paymentInstructions}
              </p>
            )}
          </div>
        )}

        {/* Notes & Terms */}
        {showNotes && data.notes && (
          <div className="my-2 p-3 rounded border border-slate-100 bg-slate-50/50 text-xs text-slate-700">
            <p className="font-bold text-[11px] uppercase tracking-wider text-slate-400 mb-1">
              Notes / Remarks
            </p>
            <p className="whitespace-pre-line leading-relaxed">{data.notes}</p>
          </div>
        )}

        {showTerms && data.terms && (
          <div className="my-2 p-3 rounded border border-slate-100 bg-slate-50/50 text-xs text-slate-600">
            <p className="font-bold text-[11px] uppercase tracking-wider text-slate-400 mb-1">
              Terms & Conditions
            </p>
            <p className="whitespace-pre-line leading-relaxed">{data.terms}</p>
          </div>
        )}

        {/* Custom Fields */}
        {settings.showCustomFields && data.customFields && data.customFields.length > 0 && (
          <div className="my-2 p-3 rounded border border-slate-100 bg-slate-50/50 text-xs">
            <p className="font-bold text-[11px] uppercase tracking-wider text-slate-400 mb-2">
              Additional Information
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {data.customFields.map((f, i) => (
                <div key={i}>
                  <span className="text-slate-400 block text-[10px] uppercase">{f.name}</span>
                  <span className="font-medium text-slate-800">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single or Dual Signature Blocks */}
        {settings.showSignatureBlock && (
          <div
            className={`mt-auto pt-8 flex items-end ${
              settings.signatureLayout === "dual" ? "justify-between" : "justify-end"
            }`}
          >
            {settings.signatureLayout === "dual" && (
              <div className="flex flex-col items-center text-center w-48">
                {settings.secondarySignatureImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={settings.secondarySignatureImageUrl}
                    alt="Secondary Signature"
                    className="h-12 w-auto object-contain mb-1"
                  />
                ) : (
                  <div className="h-12" />
                )}
                <div className="w-full border-b border-slate-400 mb-1" />
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  {settings.secondarySignatureLabel || "Prepared By"}
                </span>
              </div>
            )}

            <div className="flex flex-col items-center text-center w-48">
              {settings.signatureImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.signatureImageUrl}
                  alt="Authorized Signature"
                  className="h-12 w-auto object-contain mb-1"
                />
              ) : (
                <div className="h-12" />
              )}
              <div className="w-full border-b border-slate-400 mb-1" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                {settings.signatureLabel || "Authorized Signatory"}
              </span>
            </div>
          </div>
        )}

        {/* Optional Footer Banner Image */}
        {!shouldHideFooter && settings.footerImageUrl && (
          <div className="mt-6 w-full overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={settings.footerImageUrl} alt="Footer Banner" className="w-full h-auto object-cover" />
          </div>
        )}

        {/* Digital Footer Text */}
        {!shouldHideFooter && settings.footerText && (
          <p className="mt-4 text-center text-xs text-slate-400 border-t border-slate-100 pt-3">
            {settings.footerText}
          </p>
        )}
      </div>
    </div>
  );
}
