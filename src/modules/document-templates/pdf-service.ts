import { renderDocumentPdf } from "@/modules/document-templates/template-registry";
import { buildDocumentTemplateData } from "@/modules/document-templates/document-data-extractor";
import { assertMutationPermission } from "@/core/permissions/mutation-permissions";
import { getDocumentPdfModule } from "@/core/permissions/document-pdf-access";

export async function generateDocumentPdf(
  businessId: string,
  userId: string,
  businessName: string,
  baseCurrency: string,
  documentType: string,
  documentId: string
): Promise<{ pdf: Buffer; filename: string }> {
  const requiredModule = getDocumentPdfModule(documentType);
  if (!requiredModule) throw new Error("Unsupported document type.");
  assertMutationPermission(businessId, userId, requiredModule, "export");
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
