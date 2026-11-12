import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { DocumentList } from '../components/DocumentList';
import {
  describeEmbeddingProgress,
  onEmbeddingProgress,
} from '../services/embeddingService';
import { isSupportedFile, readFileContent } from '../services/fileImport';
import { addDocument, deleteDocument, listDocuments } from '../services/documentService';
import type { Document } from '../types/document';

type Notice = { kind: 'success' | 'error'; text: string };

export function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [embedNote, setEmbedNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onEmbeddingProgress((progress) => {
      setEmbedNote(describeEmbeddingProgress(progress));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const refresh = async () => {
    try {
      setDocuments(await listDocuments());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await listDocuments();
        if (active) setDocuments(data);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    await refresh();
    setNotice({ kind: 'success', text: 'Documento excluído.' });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setAttaching(true);
    setNotice(null);

    try {
      if (!isSupportedFile(file)) {
        setNotice({ kind: 'error', text: `"${file.name}" não parece ser um arquivo texto.` });
        return;
      }

      const content = await readFileContent(file);
      if (!content.trim()) {
        setNotice({ kind: 'error', text: 'O arquivo selecionado está vazio.' });
        return;
      }

      await addDocument(file.name, content).then((result) => {
        setNotice({
          kind: 'success',
          text:
            result.embedded > 0
              ? `"${file.name}" anexado e vetorizado (${result.totalChunks} trecho(s)).`
              : `"${file.name}" anexado com ${content.length} caracteres (busca textual — vetorização indisponível).`,
        });
      });
      await refresh();
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível ler o arquivo.',
      });
    } finally {
      setAttaching(false);
    }
  };

  if (loading) {
    return <p className="m-0 text-gray-500">Carregando documentos...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-gray-900">Documentos</h2>

      <div className="flex flex-col items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <strong className="text-gray-900">Anexar documento</strong>
        <p className="m-0 text-xs text-gray-500">
          Adicione um arquivo texto (.txt, .md, .csv, .json, .xml, .html...). O conteúdo
          é indexado aqui no navegador para a busca.
        </p>

        <label className={`inline-block${attaching ? ' cursor-not-allowed opacity-50' : ''}`}>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.csv,.json,.xml,.html,.log,.pdf,text/*,application/pdf"
            onChange={handleFileChange}
            disabled={attaching}
          />
          <span className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700">
            {attaching ? 'Anexando...' : 'Escolher arquivo'}
          </span>
        </label>

        {attaching && embedNote ? (
          <div
            className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700"
            role="status"
          >
            <span
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-600"
              aria-hidden="true"
            >
              ⏳
            </span>
            <span>{embedNote}</span>
          </div>
        ) : null}

        {notice ? (
          <div
            className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${
              notice.kind === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
            role="status"
          >
            <span
              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                notice.kind === 'success'
                  ? 'bg-green-100 text-green-600'
                  : 'bg-red-100 text-red-600'
              }`}
              aria-hidden="true"
            >
              {notice.kind === 'success' ? '✓' : '!'}
            </span>
            <span>{notice.text}</span>
          </div>
        ) : null}
      </div>

      <DocumentList documents={documents} onDelete={handleDelete} />
    </div>
  );
}