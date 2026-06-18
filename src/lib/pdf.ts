// Import the inner module directly to avoid pdf-parse's index.js debug code,
// which tries to read a bundled test PDF at load time and crashes under Next.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/** Extract plain text from a PDF / slide-export buffer. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return (data.text || "").replace(/\u0000/g, "").trim();
}

/** Extract text from a plain-text/markdown buffer (notes). */
export function extractPlainText(buffer: Buffer): string {
  return buffer.toString("utf-8").replace(/\u0000/g, "").trim();
}
