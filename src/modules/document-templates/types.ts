export interface DocumentTemplateLine {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  discount?: string;
  tax?: string;
  project?: string;
}

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
  partyHref?: string;
  customerAddress?: string;
  customerTrn?: string;
  customerEmail?: string;
  customerPhone?: string;
  lines: DocumentTemplateLine[];
  subtotal: string;
  tax: string;
  total: string;
  notes?: string;
  terms?: string;
  foreignDetail?: string;
  customFields?: Array<{ name: string; value: string }>;
  status?: string;
}

export interface DocumentTemplateVariant {
  title: string;
  partyLabel: string;
  showDueDate: boolean;
  showBuyerTrn: boolean;
  totalLabel: string;
  showTax: boolean;
}
