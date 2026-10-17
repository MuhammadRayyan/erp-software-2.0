import { renderDocumentPdf } from "@/modules/document-templates/template-registry";
import { buildDocumentTemplateData } from "@/modules/document-templates/document-data-extractor";

export async function generateDocumentPdf(
  businessId: string,
  userId: string,
  businessName: string,
  baseCurrency: string,
  documentType: string,
  documentId: string
): Promise<{ pdf: Buffer; filename: string }> {
  const { data, filename } = buildDocumentTemplateData(
    businessId,
    userId,
    businessName,
    baseCurrency,
    documentType,
    documentId
  );

  const pdf = await renderDocumentPdf(businessId, userId, documentType, data);
  return { pdf: Buffer.from(pdf), filename };
}
