import type { Template } from "@pdfme/common";
import { z } from "zod";

export type DocumentTemplate = Template;
export type DocumentInput = Record<string, string>;

const templateShape = z
  .object({
    basePdf: z.union([
      z.string(),
      z
        .object({
          width: z.number(),
          height: z.number(),
          padding: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        })
        .passthrough(),
    ]),
    schemas: z.array(
      z.array(
        z
          .object({
            name: z.string(),
            type: z.string(),
            position: z.object({ x: z.number(), y: z.number() }),
            width: z.number(),
            height: z.number(),
          })
          .passthrough(),
      ),
    ),
  })
  .passthrough();

export function validateDocumentTemplate(value: unknown): DocumentTemplate {
  return templateShape.parse(value) as DocumentTemplate;
}

export async function renderDocumentPdf(
  template: DocumentTemplate,
  input: DocumentInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const [{ generate }, schemas] = await Promise.all([
    import("@pdfme/generator"),
    import("@pdfme/schemas"),
  ]);
  const pdf = await generate({
    template,
    inputs: [input],
    plugins: { Text: schemas.text, Table: schemas.table },
  });
  return pdf;
}

export const renderInvoicePdf = renderDocumentPdf;
