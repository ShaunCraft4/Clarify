// Import the inner module directly to avoid pdf-parse's index.js debug code,
// which tries to read a bundled test PDF at load time and crashes under Next.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/** Only treat extract as dead if a page is silent this long. */
const STALL_MS = 3 * 60 * 1000;

export interface PdfExtractResult {
  text: string;
  pages: number;
}

export type PdfProgress = (page: number, total: number) => void;

type PdfPage = {
  pageNumber?: number;
  getTextContent: (opts: object) => Promise<{
    items: { str: string; transform: number[] }[];
  }>;
};

function renderPage(pageData: PdfPage): Promise<string> {
  return pageData
    .getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    })
    .then((textContent) => {
      let lastY: number | undefined;
      let text = "";
      for (const item of textContent.items) {
        if (lastY == item.transform[5] || lastY === undefined) {
          text += item.str;
        } else {
          text += `\n${item.str}`;
        }
        lastY = item.transform[5];
      }
      return text;
    });
}

/**
 * Extract every page. No page cap and no overall time limit. Progress fires
 * after each page so the UI can show "Page 12…". A stall timer only trips if
 * a single page goes silent for STALL_MS.
 */
export async function extractPdfText(
  buffer: Buffer,
  onProgress?: PdfProgress
): Promise<string> {
  const { text } = await extractPdfTextDetailed(buffer, onProgress);
  return text;
}

export async function extractPdfTextDetailed(
  buffer: Buffer,
  onProgress?: PdfProgress
): Promise<PdfExtractResult> {
  let page = 0;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectStall: (err: Error) => void = () => {};

  const stalled = new Promise<never>((_, reject) => {
    rejectStall = reject;
  });

  const bumpStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      rejectStall(
        new Error(
          `PDF extraction froze on page ${page || 1} (no progress for 3 minutes). Keep the app running and click Retry.`
        )
      );
    }, STALL_MS);
  };

  bumpStall();
  onProgress?.(0, 0);

  try {
    const data = await Promise.race([
      pdfParse(buffer, {
        max: 0,
        pagerender: async (pageData: PdfPage) => {
          page += 1;
          bumpStall();
          onProgress?.(pageData.pageNumber || page, 0);
          return renderPage(pageData);
        },
      }),
      stalled,
    ]);

    const text = String(data.text || "")
      .replace(/\u0000/g, "")
      .trim();
    const pages = Number(data.numpages) || page;
    if (pages) onProgress?.(pages, pages);
    return { text, pages };
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
}

/** Extract text from a plain-text/markdown buffer (notes). */
export function extractPlainText(buffer: Buffer): string {
  return buffer.toString("utf-8").replace(/\u0000/g, "").trim();
}
