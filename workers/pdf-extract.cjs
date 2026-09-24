"use strict";

/**
 * Extract every page in a worker so the Next.js process stays responsive.
 * Posts { type: "progress", page, total } as each page finishes, then
 * { type: "done", text, pages }.
 */
const { parentPort } = require("node:worker_threads");
const PDFJS = require("pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js");

PDFJS.disableWorker = true;

function renderPage(pageData) {
  return pageData
    .getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    })
    .then((textContent) => {
      let lastY;
      let text = "";
      for (const item of textContent.items) {
        if (lastY == item.transform[5] || !lastY) {
          text += item.str;
        } else {
          text += `\n${item.str}`;
        }
        lastY = item.transform[5];
      }
      return text;
    });
}

parentPort.on("message", async (bytes) => {
  try {
    const buffer = Buffer.from(bytes);
    const doc = await PDFJS.getDocument(buffer);
    const total = doc.numPages || 0;
    parentPort.postMessage({ type: "progress", page: 0, total });

    const parts = [];
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      parts.push(await renderPage(page));
      parentPort.postMessage({ type: "progress", page: i, total });
    }

    parentPort.postMessage({
      type: "done",
      text: parts.join("\n\n").replace(/\u0000/g, "").trim(),
      pages: total,
    });
  } catch (err) {
    parentPort.postMessage({
      type: "error",
      error: err instanceof Error ? err.message : "PDF parse failed",
    });
  }
});
