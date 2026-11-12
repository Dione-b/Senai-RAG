// Sem configuração, usa a MESMA ORIGEM da página (/api/answer), que é
// encaminhada pelo scripts/serve-web.js para o backend. Assim funciona em
// localhost, IP local e túnel ngrok sem trocar configuração.
function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  return configured ? configured.replace(/\/$/, '') : '';
}

const API_BASE_URL = resolveApiBaseUrl();

function answerUrl(): string {
  return `${API_BASE_URL}/api/answer`;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL || '(mesma origem)';
}

export async function fetchAnswer(question: string, contexts: string[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(answerUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, contexts }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    const data = await response.json();
    return data.answer || '';
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Tempo esgotado ao aguardar o servidor.');
    }

    // fetch só rejeita com TypeError quando há falha de rede/CORS/DNS.
    if (err instanceof TypeError || (err instanceof Error && /failed to fetch/i.test(err.message))) {
      throw new Error(
        `Não foi possível conectar ao servidor em ${answerUrl()}. ` +
          'Verifique se o backend está rodando (npm run server) e se o servidor web ' +
          'está ativo (npm run web:network).',
      );
    }

    throw err instanceof Error ? err : new Error('Erro desconhecido.');
  }
}