import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

export async function renderReactPdf(element: ReactElement): Promise<Buffer> {
  // @ts-expect-error renderToBuffer expects DocumentProps
  const pdfStream = await renderToBuffer(element);
  return Buffer.from(pdfStream);
}
