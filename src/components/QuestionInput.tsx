import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';

interface QuestionInputProps {
  onSubmit: (question: string) => void | Promise<void>;
  onAttach?: (file: File) => void | Promise<void>;
  attaching?: boolean;
}

export function QuestionInput({ onSubmit, onAttach, attaching }: QuestionInputProps) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const current = question.trim();
    if (!current || busy) return;

    setBusy(true);
    try {
      await onSubmit(current);
      setQuestion('');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onAttach) return;
    await onAttach(file);
  };

  const disabled = busy || attaching || question.trim().length === 0;

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Anexar documento"
          title="Anexar documento"
          disabled={attaching}
          onClick={() => fileRef.current?.click()}
        >
          <span aria-hidden="true">📎</span>
          {attaching ? 'Anexando...' : 'Anexar'}
        </button>
        <span className="hidden text-xs text-gray-500 sm:block">
          .txt, .md, .csv, .json, .xml, .html
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.csv,.json,.xml,.html,.log,.pdf,text/*,application/pdf"
        onChange={handleFileChange}
        disabled={attaching}
        hidden
      />
      <textarea
        className="min-h-[120px] max-h-[320px] w-full resize-y rounded-[10px] border border-gray-200 bg-white px-4 py-3.5 text-[15px] leading-relaxed transition-colors placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/10 focus:outline-none"
        placeholder="O que você gostaria de saber sobre seus documentos?"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        rows={4}
        aria-label="Pergunta"
      />
      <div className="flex justify-end pt-3">
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
          disabled={disabled}
        >
          {busy ? (
            <span
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
              aria-hidden="true"
            />
          ) : (
            <span aria-hidden="true">➤</span>
          )}
          {busy ? 'Perguntando...' : 'Perguntar'}
        </button>
      </div>
    </form>
  );
}