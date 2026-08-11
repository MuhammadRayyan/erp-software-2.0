import type { CanonicalEInvoice, CanonicalEInvoiceLine, CanonicalParty, CanonicalTaxBreakdown } from "@/modules/einvoicing/canonical-model";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function money(minor: number) {
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function quantity(micros: number) {
  // The existing accounting model names this field `quantity_micros`, but its
  // established Phase 1 scale is four decimal places (10,000), not 1,000,000.
  const whole = Math.floor(micros / 10_000);
  const fraction = String(micros % 10_000).padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function percent(rateBasisPoints: number) {
  const whole = Math.floor(rateBasisPoints / 100);
  const fraction = String(rateBasisPoints % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function element(name: string, value: string | null | undefined, attributes = "") {
  return value == null || value === "" ? "" : `<${name}${attributes}>${escapeXml(value)}</${name}>`;
}

function partyXml(wrapper: "cac:AccountingSupplierParty" | "cac:AccountingCustomerParty", party: CanonicalParty) {
  return `<${wrapper}>
    <cac:Party>
      ${element("cbc:EndpointID", party.endpointIdentifier, ` schemeID="${escapeXml(party.endpointScheme)}"`)}
      <cac:PostalAddress>
        ${element("cbc:StreetName", party.addressLine1)}
        ${element("cbc:CityName", party.city)}
        ${element("cbc:CountrySubentity", party.countrySubdivision)}
        <cac:Country>${element("cbc:IdentificationCode", party.countryCode)}</cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        ${element("cbc:CompanyID", party.trn)}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        ${element("cbc:RegistrationName", party.legalName)}
        ${element("cbc:CompanyID", party.legalRegistrationIdentifier, ' schemeAgencyID="TL" schemeAgencyName="Trade License issuing Authority"')}
      </cac:PartyLegalEntity>
    </cac:Party>
  </${wrapper}>`;
}

function taxSubtotalXml(breakdown: CanonicalTaxBreakdown) {
  return `<cac:TaxSubtotal>
    <cbc:TaxableAmount currencyID="AED">${money(breakdown.taxableAmountMinor)}</cbc:TaxableAmount>
    <cbc:TaxAmount currencyID="AED">${money(breakdown.taxAmountMinor)}</cbc:TaxAmount>
    <cac:TaxCategory>
      <cbc:ID>${breakdown.taxCategory}</cbc:ID>
      <cbc:Percent>${percent(breakdown.taxRateBasisPoints)}</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:TaxCategory>
  </cac:TaxSubtotal>`;
}

function lineXml(line: CanonicalEInvoiceLine, documentType: CanonicalEInvoice["documentType"]) {
  const wrapper = documentType === "invoice" ? "cac:InvoiceLine" : "cac:CreditNoteLine";
  const quantityName = documentType === "invoice" ? "cbc:InvoicedQuantity" : "cbc:CreditedQuantity";
  return `<${wrapper}>
    <cbc:ID>${escapeXml(line.id)}</cbc:ID>
    <${quantityName} unitCode="${escapeXml(line.unitCode)}">${quantity(line.quantityMicros)}</${quantityName}>
    <cbc:LineExtensionAmount currencyID="AED">${money(line.netAmountMinor)}</cbc:LineExtensionAmount>
    <cac:Item>
      ${element("cbc:Description", line.description)}
      ${element("cbc:Name", line.itemName)}
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${line.taxCategory}</cbc:ID>
        <cbc:Percent>${percent(line.taxRateBasisPoints)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="AED">${money(line.unitPriceMinor)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="${escapeXml(line.unitCode)}">1</cbc:BaseQuantity>
      <cac:AllowanceCharge>
        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
        <cbc:Amount currencyID="AED">0.00</cbc:Amount>
        <cbc:BaseAmount currencyID="AED">${money(line.unitPriceMinor)}</cbc:BaseAmount>
      </cac:AllowanceCharge>
    </cac:Price>
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="AED">${money(line.grossAmountMinor)}</cbc:Amount>
      <cac:TaxTotal><cbc:TaxAmount currencyID="AED">${money(line.taxAmountMinor)}</cbc:TaxAmount></cac:TaxTotal>
    </cac:ItemPriceExtension>
  </${wrapper}>`;
}

export function generatePintAeXml(document: CanonicalEInvoice) {
  const isInvoice = document.documentType === "invoice";
  const root = isInvoice ? "Invoice" : "CreditNote";
  const namespace = `urn:oasis:names:specification:ubl:schema:xsd:${root}-2`;
  const typeCode = isInvoice
    ? "<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>"
    : "<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>";
  const dueDate = isInvoice ? element("cbc:DueDate", document.dueDate) : "";
  const note = element("cbc:Note", document.note);
  const buyerReference = element("cbc:BuyerReference", document.buyerReference);
  const discrepancy = !isInvoice
    ? `<cac:DiscrepancyResponse><cbc:ResponseCode>${escapeXml(document.creditNoteReasonCode ?? "")}</cbc:ResponseCode></cac:DiscrepancyResponse>`
    : "";
  const billingReference = document.billingReference
    ? `<cac:BillingReference><cac:InvoiceDocumentReference>
        <cbc:ID>${escapeXml(document.billingReference.documentNumber)}</cbc:ID>
        <cbc:IssueDate>${escapeXml(document.billingReference.issueDate)}</cbc:IssueDate>
      </cac:InvoiceDocumentReference></cac:BillingReference>`
    : "";
  const paymentMeans = isInvoice
    ? '<cac:PaymentMeans><cbc:PaymentMeansCode name="Instrument not defined">1</cbc:PaymentMeansCode></cac:PaymentMeans>'
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${namespace}"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${escapeXml(document.customizationId)}</cbc:CustomizationID>
  <cbc:ProfileID>${escapeXml(document.profileId)}</cbc:ProfileID>
  <cbc:ProfileExecutionID>${escapeXml(document.profileExecutionId)}</cbc:ProfileExecutionID>
  <cbc:ID>${escapeXml(document.documentNumber)}</cbc:ID>
  <cbc:UUID>${escapeXml(document.uuid)}</cbc:UUID>
  <cbc:IssueDate>${escapeXml(document.issueDate)}</cbc:IssueDate>
  ${dueDate}
  ${typeCode}
  ${note}
  <cbc:DocumentCurrencyCode>AED</cbc:DocumentCurrencyCode>
  ${buyerReference}
  ${discrepancy}
  ${billingReference}
  ${partyXml("cac:AccountingSupplierParty", document.supplier)}
  ${partyXml("cac:AccountingCustomerParty", document.buyer)}
  ${paymentMeans}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="AED">${money(document.taxMinor)}</cbc:TaxAmount>
    <cbc:TaxIncludedIndicator>false</cbc:TaxIncludedIndicator>
    ${document.taxBreakdowns.map(taxSubtotalXml).join("\n")}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="AED">${money(document.subtotalMinor)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="AED">${money(document.subtotalMinor)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="AED">${money(document.totalMinor)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="AED">${money(document.totalMinor)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${document.lines.map((line) => lineXml(line, document.documentType)).join("\n")}
</${root}>`;
}
