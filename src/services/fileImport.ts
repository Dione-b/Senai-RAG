import { pdfToText } from './pdfService';

const TEXT_TYPES = ['text/', 'application/json', 'application/xml', ''];

/** Tipos de arquivo aceitos como conteúdo indexável (texto puro ou PDF). */
export function isSupportedFile(file: File): boolean {
  return (
    TEXT_TYPES.some((t) => t && file.type.startsWith(t)) ||
    /\.(txt|md|csv|json|xml|html|log|ts|js|tsx|jsx|css|pdf)$/i.test(file.name)
  );
}

/**
 * Lê o conteúdo do anexo como texto. PDFs são convertidos para TXT
 * (extração de texto com quebras preservadas) antes de serem indexados.
 */
export async function readFileContent(file: File): Promise<string> {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const { text } = await pdfToText(await file.arrayBuffer());
    if (!text.trim()) {
      throw new Error(
        `"${file.name}" não contém texto extraível (pode ser um PDF digitalizado ou só imagens).`,
      );
    }
    return text;
  }

  return file.text();
}
