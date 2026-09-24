import { Worker } from "node:worker_threads";
import path from "node:path";

/** Only treat the worker as dead if a single page is silent this long. */
const STALL_MS = 3 * 60 * 1000;

export interface PdfExtractResult {
  text: string;
  pages: number;
}

export type PdfProgress = (page: number, total: number) => void;

/**
 * Extract every page of a PDF in a worker thread. There is no page cap and no
 * overall time limit — a textbook can take as long as it needs. The worker is
 * only killed if it goes silent for STALL_MS (a hung page, not a slow book).
 */
export async function extractPdfText(
  buffer: Buffer,
  onProgress?: PdfProgress
): Promise<string> {
  const { text } = await extractPdfTextDetailed(buffer, onProgress);
  return text;
}

export function extractPdfTextDetailed(
  buffer: Buffer,
  onProgress?: PdfProgress
): Promise<PdfExtractResult> {
  const workerPath = path.join(process.cwd(), "workers", "pdf-extract.cjs");

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath);
    let settled = false;
    let lastPage = 0;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      void worker.terminate();
      fn();
    };

    const bumpStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        finish(() =>
          reject(
            new Error(
              `PDF extraction froze on page ${lastPage || 1} (no progress for 3 minutes). Keep the app running and click Retry.`
            )
          )
        );
      }, STALL_MS);
    };

    let stallTimer = setTimeout(() => {}, 0);
    bumpStall();

    worker.on(
      "message",
      (msg: {
        type?: string;
        page?: number;
        total?: number;
        text?: string;
        pages?: number;
        error?: string;
        ok?: boolean;
      }) => {
        if (msg.type === "progress" || (msg.page && !msg.type && !msg.ok && !msg.text)) {
          lastPage = msg.page ?? lastPage;
          bumpStall();
          onProgress?.(msg.page ?? lastPage, msg.total ?? 0);
          return;
        }
        if (msg.type === "error" || msg.ok === false) {
          finish(() =>
            reject(new Error(msg.error || "Could not read this PDF."))
          );
          return;
        }
        if (msg.type === "done" || msg.ok) {
          finish(() =>
            resolve({ text: msg.text ?? "", pages: msg.pages ?? lastPage })
          );
        }
      }
    );

    worker.once("error", (err) => {
      finish(() => reject(err));
    });

    worker.once("exit", (code) => {
      if (code !== 0 && !settled) {
        finish(() =>
          reject(new Error(`PDF worker exited unexpectedly (${code}).`))
        );
      }
    });

    worker.postMessage(buffer);
  });
}

/** Extract text from a plain-text/markdown buffer (notes). */
export function extractPlainText(buffer: Buffer): string {
  return buffer.toString("utf-8").replace(/\u0000/g, "").trim();
}
