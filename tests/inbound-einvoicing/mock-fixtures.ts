import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";
import type { CanonicalEInvoice, CanonicalEInvoiceLine, CanonicalParty } from "@/modules/einvoicing/canonical-model";
import {
  PINT_AE_CUSTOMIZATION_ID,
  PINT_AE_PROFILE_ID,
  PINT_AE_SPECIFICATION_VERSION,
  emptyTransactionFlags,
} from "@/modules/einvoicing/einvoice-types";
import { generatePintAeXml } from "@/modules/einvoicing/pint-ae/versions/v1.0.4/xml-generator";
import type { AspInboundEnvelope } from "@/modules/einvoicing/providers/asp-provider";
import { mockInboundScenarios, type MockInboundScenario } from "./mock-scenarios";

type SupplierFixture = {
  id: string;
  name: string;
  legal_name: string | null;
  trn: string | null;
  tax_reference: string | null;
  legal_registration_identifier: string | null;
  electronic_address: string | null;
  electronic_address_scheme: string | null;
  registered_address: string | null;
  country_code: string | null;
};

type OrderFixture = { id: string; order_number: string; supplier_id: string };
type OrderLineFixture = {
  id: string;
  description: string;
  quantity_micros: number;
  unit_price_minor: number;
  item_id: string | null;
  position: number;
};
type GoodsReceiptFixture = { id: string; receipt_number: string; purchase_order_id: string; supplier_id: string };

function party(input: {
  legalName: string;
  trn: string;
  legalRegistrationIdentifier: string;
  endpointIdentifier: string;
  endpointScheme: string;
  addressLine1: string;
}): CanonicalParty {
  return {
    ...input,
    city: "Dubai",
    countrySubdivision: "DXB",
    countryCode: "AE",
  };
}

function supplierParty(supplier: SupplierFixture): CanonicalParty {
  if (!supplier.electronic_address || !supplier.electronic_address_scheme) {
    throw new Error("The Mock fixture Supplier needs an electronic address and scheme.");
  }
  return party({
    legalName: supplier.legal_name ?? supplier.name,
    trn: supplier.trn ?? supplier.tax_reference ?? "",
    legalRegistrationIdentifier: supplier.legal_registration_identifier ?? `MOCK-${supplier.id}`,
    endpointIdentifier: supplier.electronic_address,
    endpointScheme: supplier.electronic_address_scheme,
    addressLine1: supplier.registered_address ?? "Mock Supplier Address",
  });
}

function injectReferences(
  xml: string,
  references: { orderReference?: string | null; orderLineReference?: string | null; despatchReference?: string | null },
) {
  let result = xml;
  const documentReferences = [
    references.orderReference
      ? `<cac:OrderReference><cbc:ID>${references.orderReference}</cbc:ID></cac:OrderReference>`
      : "",
    references.despatchReference
      ? `<cac:DespatchDocumentReference><cbc:ID>${references.despatchReference}</cbc:ID></cac:DespatchDocumentReference>`
      : "",
  ].filter(Boolean).join("\n  ");
  if (documentReferences) {
    result = result.replace(
      /(<cac:AccountingSupplierParty>)/,
      `${documentReferences}\n  $1`,
    );
  }
  if (references.orderLineReference) {
    result = result.replace(
      /(<cac:(?:InvoiceLine|CreditNoteLine)>[\s\S]*?<cbc:LineExtensionAmount\b[^>]*>[^<]+<\/cbc:LineExtensionAmount>)/,
      `$1\n    <cac:OrderLineReference><cbc:LineID>${references.orderLineReference}</cbc:LineID></cac:OrderLineReference>`,
    );
  }
  return result;
}

export function buildMockInboundEnvelope(
  businessId: string,
  userId: string,
  scenario: MockInboundScenario,
): AspInboundEnvelope {
  if (!mockInboundScenarios.includes(scenario)) throw new Error("Unknown Mock inbound scenario.");
  const { sqlite } = getBusinessDb(businessId, userId);
  const business = sqlite.prepare(`
    SELECT eis.legal_name, eis.legal_registration_identifier, eis.address_line_1,
      eis.endpoint_identifier, eis.endpoint_identifier_scheme, ts.trn
    FROM business_einvoice_settings eis
    INNER JOIN business_tax_settings ts ON ts.id = 'default'
    WHERE eis.id = 'default'
  `).get() as {
    legal_name: string | null;
    legal_registration_identifier: string | null;
    address_line_1: string | null;
    endpoint_identifier: string | null;
    endpoint_identifier_scheme: string | null;
    trn: string | null;
  };
  if (
    !business.legal_name || !business.legal_registration_identifier || !business.address_line_1
    || !business.endpoint_identifier || !business.endpoint_identifier_scheme || !business.trn
  ) {
    throw new Error("Complete the business Electronic Invoicing identity before using Mock inbound fixtures.");
  }
  const buyer = party({
    legalName: business.legal_name,
    trn: business.trn,
    legalRegistrationIdentifier: business.legal_registration_identifier,
    endpointIdentifier: business.endpoint_identifier,
    endpointScheme: business.endpoint_identifier_scheme,
    addressLine1: business.address_line_1,
  });
  let supplier = sqlite.prepare(`
    SELECT * FROM suppliers
    WHERE is_active = 1 AND electronic_address IS NOT NULL
    ORDER BY name LIMIT 1
  `).get() as SupplierFixture | undefined;
  let order: OrderFixture | null = null;
  let orderLine: OrderLineFixture | null = null;
  let goodsReceipt: GoodsReceiptFixture | null = null;
  if (scenario === "po_matched_invoice" || scenario === "goods_receipt_matched_invoice") {
    if (scenario === "goods_receipt_matched_invoice") {
      goodsReceipt = sqlite.prepare(`
        SELECT gr.id, gr.receipt_number, gr.purchase_order_id, gr.supplier_id
        FROM goods_receipts gr
        INNER JOIN suppliers s ON s.id = gr.supplier_id
          AND s.is_active = 1 AND s.trn IS NOT NULL
          AND s.electronic_address IS NOT NULL AND s.electronic_address_scheme IS NOT NULL
        WHERE gr.document_status = 'posted' AND gr.purchase_order_id IS NOT NULL
        ORDER BY gr.date DESC, gr.created_at DESC LIMIT 1
      `).get() as GoodsReceiptFixture | undefined ?? null;
      if (!goodsReceipt) throw new Error("Create a posted Goods Receipt linked to a Purchase Order for this Mock scenario.");
      order = sqlite.prepare(`
        SELECT id, order_number, supplier_id FROM purchase_orders WHERE id = ?
      `).get(goodsReceipt.purchase_order_id) as OrderFixture | undefined ?? null;
    } else {
      order = sqlite.prepare(`
        SELECT po.id, po.order_number, po.supplier_id FROM purchase_orders po
        INNER JOIN suppliers s ON s.id = po.supplier_id
          AND s.is_active = 1 AND s.trn IS NOT NULL
          AND s.electronic_address IS NOT NULL AND s.electronic_address_scheme IS NOT NULL
        WHERE po.status IN ('issued', 'closed') ORDER BY po.date DESC, po.created_at DESC LIMIT 1
      `).get() as OrderFixture | undefined ?? null;
    }
    if (!order) throw new Error("Create an issued Purchase Order for this Mock scenario.");
    supplier = sqlite.prepare("SELECT * FROM suppliers WHERE id = ?")
      .get(order.supplier_id) as SupplierFixture;
    orderLine = sqlite.prepare(`
      SELECT id, description, quantity_micros, unit_price_minor, item_id, position
      FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY position LIMIT 1
    `).get(order.id) as OrderLineFixture | undefined ?? null;
    if (!orderLine) throw new Error("The Mock Purchase Order needs at least one line.");
  }
  if (!supplier) throw new Error("Create an active Supplier before using Mock inbound fixtures.");
  const unknown = scenario === "unknown_supplier";
  const seller = unknown
    ? party({
        legalName: "Unknown Mock Supplier LLC",
        trn: "199999999999903",
        legalRegistrationIdentifier: "UNKNOWN-MOCK-TL",
        endpointIdentifier: "1999999999",
        endpointScheme: "0235",
        addressLine1: "99 Unknown Supplier Road",
      })
    : supplierParty(supplier);
  const fixedDuplicateUuid = "00000000-0000-4000-8000-000000000008";
  const uuid = scenario === "duplicate_invoice" ? fixedDuplicateUuid : randomUUID();
  const issueDate = new Date().toISOString().slice(0, 10);
  const due = new Date(`${issueDate}T00:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() + 30);
  const quantityMicros = orderLine?.quantity_micros ?? 10_000;
  const unitPriceMinor = orderLine?.unit_price_minor ?? 100_00;
  const netAmountMinor = Math.round((quantityMicros * unitPriceMinor) / 10_000);
  const vatRate = scenario === "vat_mismatch" ? 700 : 500;
  const taxAmountMinor = Math.round((netAmountMinor * vatRate) / 10_000);
  const taxCategory = "S" as const;
  const line: CanonicalEInvoiceLine = {
    id: "1",
    description: orderLine?.description ?? "Mock inbound supplier service",
    itemName: orderLine?.description ?? "Mock inbound supplier service",
    quantityMicros,
    unitCode: "C62",
    unitPriceMinor,
    netAmountMinor,
    taxAmountMinor,
    grossAmountMinor: netAmountMinor + taxAmountMinor,
    taxCategory,
    taxRateBasisPoints: vatRate,
  };
  const creditNote = scenario === "unsupported_credit_note";
  const document: CanonicalEInvoice = {
    specificationVersion: PINT_AE_SPECIFICATION_VERSION,
    customizationId: PINT_AE_CUSTOMIZATION_ID,
    profileId: PINT_AE_PROFILE_ID,
    profileExecutionId: "00000000",
    uuid,
    sourceType: creditNote ? "sales_credit_note" : "sales_invoice",
    sourceId: `mock-${scenario}`,
    documentType: creditNote ? "credit_note" : "invoice",
    documentNumber: scenario === "duplicate_invoice" ? "MOCK-DUPLICATE-0008" : `MOCK-${scenario.toUpperCase()}-${uuid.slice(0, 8)}`,
    issueDate,
    dueDate: creditNote ? null : due.toISOString().slice(0, 10),
    currencyCode: "AED",
    supplier: seller,
    buyer,
    buyerReference: "MOCK-AP",
    billingReference: creditNote ? { documentNumber: "MOCK-SOURCE-INVOICE", issueDate } : null,
    creditNoteReasonCode: creditNote ? "DL8.61.1.D" : null,
    note: creditNote ? "MOCK credit note — conversion intentionally unsupported" : "MOCK inbound PINT-AE fixture",
    transactionFlags: emptyTransactionFlags,
    lines: [line],
    taxBreakdowns: [{
      taxCategory,
      taxRateBasisPoints: vatRate,
      taxableAmountMinor: netAmountMinor,
      taxAmountMinor,
    }],
    subtotalMinor: netAmountMinor,
    taxMinor: taxAmountMinor,
    totalMinor: netAmountMinor + taxAmountMinor,
  };
  let xml = injectReferences(generatePintAeXml(document), {
    orderReference: order?.order_number,
    orderLineReference: orderLine ? String(orderLine.position + 1) : null,
    despatchReference: goodsReceipt?.receipt_number,
  });
  if (scenario === "invalid_invoice") {
    xml = xml.replace(
      /(<cbc:TaxInclusiveAmount\b[^>]*>)[^<]+/,
      (_match, start: string) => `${start}99999.99`,
    );
  }
  const providerDocumentId = scenario === "duplicate_invoice"
    ? "MOCK-DUPLICATE-DOCUMENT-0008"
    : `MOCK-${randomUUID()}`;
  return {
    providerDocumentId,
    providerEventId: `MOCK-EVENT-${randomUUID()}`,
    specificationVersion: PINT_AE_SPECIFICATION_VERSION,
    contentType: "application/xml; charset=utf-8",
    payload: xml,
    networkStatus: "MOCK_RECEIVED",
    metadata: { mock: true, scenario },
  };
}
