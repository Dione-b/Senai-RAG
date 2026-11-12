import { useEffect, useState } from 'react';
import { DocumentList } from '../components/DocumentList';
import { QuestionInput } from '../components/QuestionInput';
import { fetchAnswer } from '../services/apiService';
import {
  describeEmbeddingProgress,
  onEmbeddingProgress,
} from '../services/embeddingService';
import { isSupportedFile, readFileContent } from '../services/fileImport';
import { addDocument, deleteDocument, listDocuments, searchRelevantChunks } from '../services/documentService';
import type { Document } from '../types/document';
import type { RelevantChunk } from '../types/search';
import { toPlainText } from '../utils/plainText';

type Notice = { kind: 'success' | 'error'; text: string };
type Status = 'idle' | 'searching' | 'success' | 'no-context' | 'error';

export function HomePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [embedNote, setEmbedNote] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<RelevantChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const refreshDocs = async () => {
    try {
      setDocuments(await listDocuments());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onEmbeddingProgress((progress) => {
      setEmbedNote(describeEmbeddingProgress(progress));
    });
    return () => unsubscribe();
  }, []);

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

  const handleAttach = async (file: File) => {
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

      const result = await addDocument(file.name, content);
      setNotice({
        kind: 'success',
        text:
          result.embedded > 0
            ? `"${file.name}" anexado e vetorizado (${result.totalChunks} trecho(s)).`
            : `"${file.name}" anexado com ${content.length} caracteres (busca textual — vetorização indisponível).`,
      });
      await refreshDocs();
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Não foi possível ler o arquivo.',
      });
    } finally {
      setAttaching(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    await refreshDocs();
    setNotice({ kind: 'success', text: 'Documento excluído.' });
  };

  const ask = async (question: string) => {
    setStatus('searching');
    setError(null);
    setAnswer(null);
    setSources([]);
    setEmbedNote(null);
    setAskedQuestion(question);
    setLastQuestion(question);

    try {
      const chunks = await searchRelevantChunks(question, 5);
      setSources(chunks);

      if (chunks.length === 0) {
        setStatus('no-context');
        return;
      }

      const contexts = chunks.map((c) => c.content);
      const result = await fetchAnswer(question, contexts);
      setAnswer(result || 'Sem resposta.');
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao obter resposta.');
      setStatus('error');
    }
  };

  const retry = () => {
    if (lastQuestion) void ask(lastQuestion);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-[28px]">
          Assistente de Documentos
        </h1>
        <p className="m-0 text-[15px] text-gray-500">
          Faça perguntas e obtenha respostas com base nos documentos anexados.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <QuestionInput onSubmit={ask} onAttach={handleAttach} attaching={attaching} />

        {attaching && embedNote ? (
          <div
            className="mt-3 flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700"
            role="status"
          >
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-600" aria-hidden="true">
              ⏳
            </span>
            <span>{embedNote}</span>
          </div>
        ) : null}

        {notice ? (
          <div
            className={`mt-3 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${
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
      </section>

      {askedQuestion ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-gray-100 p-5">
            <span className="text-xs text-gray-500">Sua pergunta:</span>
            <strong className="text-gray-900">{askedQuestion}</strong>
          </div>

          {status === 'searching' ? (
            <div className="flex flex-col items-start gap-2.5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <span
                className="h-4.5 w-4.5 shrink-0 animate-spin rounded-full border-[3px] border-gray-300 border-t-blue-600"
                aria-hidden="true"
              />
              <span>Buscando trechos e gerando resposta...</span>
              {embedNote ? <span className="text-xs text-gray-500">{embedNote}</span> : null}
            </div>
          ) : null}

          {status === 'no-context' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
              Nenhum trecho relevante encontrado nos documentos. Anexe documentos
              que contenham a resposta.
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="flex flex-col items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
              <span>Erro: {error}</span>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
                onClick={retry}
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {status === 'success' && answer ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-5">
              <p className="m-0 leading-relaxed whitespace-pre-wrap text-gray-800">
                {toPlainText(answer)}
              </p>
            </div>
          ) : null}

          {sources.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Fontes utilizadas ({sources.length})
              </h3>
              <div className="flex flex-col gap-2.5">
                {sources.map((source, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <strong className="text-sm font-semibold text-gray-900">
                      {source.title}
                    </strong>
                    <p className="scroll-thin m-0 mt-1.5 max-h-[120px] overflow-auto text-sm leading-relaxed text-gray-700 [overflow-wrap:anywhere] whitespace-pre-wrap">
                      {toPlainText(source.content)}
                    </p>
                    <span className="mt-1.5 text-xs text-gray-500">
                      relevância:{' '}
                      {typeof source.rank === 'number' ? source.rank.toFixed(4) : 'n/d'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-gray-900">Documentos anexados</h3>
        {loading ? <p className="m-0 text-gray-500">Carregando documentos...</p> : null}
        <DocumentList documents={documents} onDelete={handleDelete} />
      </section>
    </div>
  );
}