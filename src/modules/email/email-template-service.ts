import { getBusinessDb } from "@/core/db/business";
import { randomUUID } from "node:crypto";

export type EmailTemplate = {
  id: string;
  document_type: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export const SUPPORTED_TEMPLATE_TYPES: { type: string; name: string; description: string }[] = [
  {
    type: "sales-invoice",
    name: "Sales Invoice",
    description: "Email sent to customer when dispatching a sales invoice.",
  },
  {
    type: "sales-quote",
    name: "Sales Quote",
    description: "Email sent to customer when presenting an estimate or quote.",
  },
  {
    type: "sales-order",
    name: "Sales Order",
    description: "Order confirmation sent upon sales order approval.",
  },
  {
    type: "delivery-note",
    name: "Delivery Note",
    description: "Dispatch notification sent when goods are delivered.",
  },
  {
    type: "purchase-order",
    name: "Purchase Order",
    description: "Official purchase order issued to vendors and suppliers.",
  },
  {
    type: "customer-statement",
    name: "Customer Statement",
    description: "Periodic account balance and transaction statement.",
  },
  {
    type: "receipt",
    name: "Payment Receipt",
    description: "Confirmation of received payment sent to customers.",
  },
];

export const TEMPLATE_VARIABLES: { key: string; label: string; example: string }[] = [
  { key: "{{customer_name}}", label: "Customer / Recipient Name", example: "Acme Corp" },
  { key: "{{document_number}}", label: "Document Reference Number", example: "INV-00104" },
  { key: "{{business_name}}", label: "Your Business Name", example: "Global Logistics LLC" },
  { key: "{{total_amount}}", label: "Total Amount", example: "AED 5,250.00" },
  { key: "{{balance_due}}", label: "Remaining Balance Due", example: "AED 5,250.00" },
  { key: "{{document_date}}", label: "Issue Date", example: "15 Oct 2026" },
  { key: "{{due_date}}", label: "Due / Expiry Date", example: "14 Nov 2026" },
  { key: "{{currency}}", label: "Currency Code", example: "AED" },
];

export const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  "sales-invoice": {
    subject: "Invoice {{document_number}} from {{business_name}}",
    body: `Hello {{customer_name}},

Please find your sales invoice {{document_number}} for {{total_amount}} attached. Payment is due by {{due_date}}.

Remaining Balance Due: {{balance_due}}

Thank you for your business!

Best regards,
{{business_name}}`,
  },
  "sales-quote": {
    subject: "Sales Quote {{document_number}} from {{business_name}}",
    body: `Hello {{customer_name}},

Thank you for your inquiry. Please find our formal sales quotation {{document_number}} for {{total_amount}} attached. This quote is valid until {{due_date}}.

Please let us know if you have any questions or require modifications.

Best regards,
{{business_name}}`,
  },
  "sales-order": {
    subject: "Sales Order {{document_number}} Confirmation - {{business_name}}",
    body: `Hello {{customer_name}},

Your sales order {{document_number}} has been received and confirmed for a total of {{total_amount}}.

We will keep you updated on dispatch and fulfillment progress.

Best regards,
{{business_name}}`,
  },
  "delivery-note": {
    subject: "Delivery Note {{document_number}} for {{customer_name}}",
    body: `Hello {{customer_name}},

Please find delivery note {{document_number}} for your recent order attached. 

Kindly inspect the delivered items upon arrival and let us know if anything requires attention.

Best regards,
{{business_name}}`,
  },
  "purchase-order": {
    subject: "Purchase Order {{document_number}} from {{business_name}}",
    body: `Hello {{customer_name}},

Please find attached our official Purchase Order {{document_number}} for {{total_amount}}.

Kindly confirm receipt and provide estimated delivery schedule.

Best regards,
{{business_name}}`,
  },
  "customer-statement": {
    subject: "Account Statement from {{business_name}}",
    body: `Hello {{customer_name}},

Please find attached your statement of account from {{business_name}} as of {{document_date}}.

Current outstanding balance: {{balance_due}}

Thank you for your continued partnership.

Best regards,
{{business_name}}`,
  },
  receipt: {
    subject: "Payment Receipt {{document_number}} from {{business_name}}",
    body: `Hello {{customer_name}},

We have successfully received your payment of {{total_amount}} referenced under receipt {{document_number}}.

Your updated account balance is {{balance_due}}. Thank you for your prompt payment!

Best regards,
{{business_name}}`,
  },
};

export function listEmailTemplates(businessId: string): EmailTemplate[] {
  const { sqlite } = getBusinessDb(businessId);
  return sqlite
    .prepare(
      `SELECT id, document_type, name, subject, body, created_at, updated_at
       FROM email_templates
       ORDER BY name ASC`
    )
    .all() as EmailTemplate[];
}

export function getEmailTemplate(businessId: string, documentType: string): EmailTemplate | null {
  const { sqlite } = getBusinessDb(businessId);
  const snake = documentType.replace(/-/g, "_");
  const kebab = documentType.replace(/_/g, "-");
  return (
    (sqlite
      .prepare(
        `SELECT id, document_type, name, subject, body, created_at, updated_at
         FROM email_templates
         WHERE document_type = ? OR document_type = ?`
      )
      .get(snake, kebab) as EmailTemplate | undefined) ?? null
  );
}

export function saveEmailTemplate(
  businessId: string,
  documentType: string,
  input: { subject: string; body: string; name?: string }
): EmailTemplate {
  const { sqlite } = getBusinessDb(businessId);
  const existing = getEmailTemplate(businessId, documentType);
  const def = SUPPORTED_TEMPLATE_TYPES.find((t) => t.type === documentType || t.type === documentType.replace(/-/g, "_"));
  const name = input.name || def?.name || documentType;
  const now = new Date().toISOString();

  if (existing) {
    sqlite.prepare(
      `UPDATE email_templates
       SET subject = ?, body = ?, name = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.subject, input.body, name, now, existing.id);
    return getEmailTemplate(businessId, documentType)!;
  } else {
    const id = randomUUID();
    const docType = documentType.replace(/-/g, "_");
    sqlite.prepare(
      `INSERT INTO email_templates (id, document_type, name, subject, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, docType, name, input.subject, input.body, now, now);
    return getEmailTemplate(businessId, documentType)!;
  }
}

export function resetEmailTemplate(businessId: string, documentType: string): EmailTemplate {
  const defaults =
    DEFAULT_TEMPLATES[documentType] ||
    DEFAULT_TEMPLATES[documentType.replace(/_/g, "-")] ||
    DEFAULT_TEMPLATES[documentType.replace(/-/g, "_")] || {
      subject: `Document {{document_number}} from {{business_name}}`,
      body: `Hello {{customer_name}},\n\nPlease find document {{document_number}} attached.\n\nBest regards,\n{{business_name}}`,
    };
  const def = SUPPORTED_TEMPLATE_TYPES.find((t) => t.type === documentType || t.type === documentType.replace(/-/g, "_"));
  return saveEmailTemplate(businessId, documentType, {
    subject: defaults.subject,
    body: defaults.body,
    name: def?.name || documentType,
  });
}

/**
 * Replaces {{customer_name}}, {{document_number}}, etc. with concrete values.
 */
export function interpolateEmailTemplate(
  template: { subject: string; body: string },
  variables: Record<string, string | null | undefined>
): { subject: string; body: string } {
  // Normalize variable map: support both snake_case and camelCase
  const lookup: Record<string, string> = {
    customer_name: variables.customerName || variables.customer_name || "Customer",
    customername: variables.customerName || variables.customer_name || "Customer",
    document_number: variables.documentNumber || variables.document_number || "",
    documentnumber: variables.documentNumber || variables.document_number || "",
    business_name: variables.businessName || variables.business_name || "Company",
    businessname: variables.businessName || variables.business_name || "Company",
    total_amount: variables.total || variables.total_amount || "",
    total: variables.total || variables.total_amount || "",
    balance_due: variables.balance || variables.balance_due || variables.total || "",
    balance: variables.balance || variables.balance_due || variables.total || "",
    document_date: variables.documentDate || variables.document_date || "",
    documentdate: variables.documentDate || variables.document_date || "",
    due_date: variables.dueDate || variables.due_date || "",
    duedate: variables.dueDate || variables.due_date || "",
    currency: variables.currency || "",
  };

  const replace = (text: string) => {
    return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
      const normalized = key.toLowerCase();
      return lookup[normalized] !== undefined ? lookup[normalized] : `{{${key}}}`;
    });
  };

  return {
    subject: replace(template.subject),
    body: replace(template.body),
  };
}
