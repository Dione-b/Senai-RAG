import type { Document } from '../types/document';
import { toPlainText } from '../utils/plainText';

interface DocumentListProps {
  documents: Document[];
  onDelete?: (id: string) => void;
}

const EXT_ICON: Record<string, string> = {
  pdf: '📄',
  md: '📝',
  txt: '📃',
  csv: '📊',
  json: '🧩',
  xml: '🧩',
  html: '🌐',
  log: '🪵',
  ts: '🟦',
  tsx: '⚛️',
  js: '🟨',
  jsx: '⚛️',
  css: '🎨',
};

function getExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function formatSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ documents, onDelete }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-8 text-center shadow-sm"
        role="status"
      >
        <span className="text-3xl opacity-60" aria-hidden="true">
          📂
        </span>
        <p className="m-0 text-[15px] font-semibold text-gray-700">
          Nenhum documento anexado
        </p>
        <p className="m-0 text-xs text-gray-500">
          Anexe arquivos de texto para começar a consultar seus documentos.
        </p>
      </div>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {documents.map((doc) => {
        const ext = getExtension(doc.title);
        const icon = EXT_ICON[ext] ?? '📄';

        return (
          <li
            key={doc.id}
            className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-lg"
                aria-hidden="true"
              >
                {icon}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm leading-snug font-semibold text-gray-900 [overflow-wrap:anywhere]">
                  {doc.title}
                </span>
                <span className="text-xs text-gray-500">
                  {ext ? ext.toUpperCase() : 'ARQUIVO'} · {formatSize(doc.content)}
                </span>
              </div>
              {onDelete ? (
                <button
                  type="button"
                  className="inline-flex h-9 shrink-0 items-center rounded-lg border border-transparent px-3 text-[13px] text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  onClick={() => onDelete(doc.id)}
                  aria-label={`Remover ${doc.title}`}
                >
                  Remover
                </button>
              ) : null}
            </div>

            <div className="scroll-thin max-h-[180px] overflow-auto rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 text-[13px] leading-relaxed text-gray-700 [overflow-wrap:anywhere] whitespace-pre-wrap">
              {toPlainText(doc.content) || '(sem conteúdo)'}
            </div>
          </li>
        );
      })}
    </ul>
  );
}