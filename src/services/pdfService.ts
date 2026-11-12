import type * as PdfjsModule from 'pdfjs-dist';

export interface PdfTextResult {
  text: string;
  pages: number;
}

// Carregado sob demanda (code-split) para não pesar o bundle inicial.
let pdfjsPromise: Promise<typeof PdfjsModule> | null = null;

async function getPdfjs(): Promise<typeof PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/**
 * Extrai o texto de um PDF usando o pdf.js (worker empacotado, self-hosted).
 * Reconstrói as linhas a partir de `hasEOL` para preservar a formatação
 * original (quebras de linha e parágrafos entre páginas).
 */
export async function pdfToText(data: ArrayBuffer): Promise<PdfTextResult> {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  const numPages = doc.numPages;

  try {
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      let pageText = '';
      for (const item of content.items) {
        if ('str' in item) {
          pageText += item.str;
          if (item.hasEOL) pageText += '\n';
        }
      }
      pageTexts.push(pageText.trim());
    }

    // Páginas separadas por linha em branco (parágrafo).
    return { text: pageTexts.join('\n\n'), pages: numPages };
  } finally {
    void task.destroy();
  }
}
