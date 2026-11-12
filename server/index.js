require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CONTEXTS = 5;
const MAX_PAYLOAD = '100kb';

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is required');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: MAX_PAYLOAD }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Invalid JSON body';
  const { question, contexts } = body;

  if (typeof question !== 'string' || question.trim().length === 0) {
    return 'question must be a non-empty string';
  }
  if (question.length > 4000) {
    return 'question is too long';
  }

  if (contexts !== undefined) {
    if (!Array.isArray(contexts)) return 'contexts must be an array';
    if (contexts.length > MAX_CONTEXTS) return `contexts must have at most ${MAX_CONTEXTS} items`;
    for (const ctx of contexts) {
      if (typeof ctx !== 'string') return 'each context must be a string';
      if (ctx.length > 8000) return 'context is too long';
    }
  }

  return null;
}

app.post('/api/answer', async (req, res) => {
  const error = validateBody(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const question = req.body.question.trim();
  const contexts = Array.isArray(req.body.contexts) ? req.body.contexts : [];

  const contextBlock = contexts
    .map((c, i) => `Contexto ${i + 1}:\n${c}`)
    .join('\n\n');

  const userContent = contextBlock
    ? `${contextBlock}\n\nPergunta: ${question}`
    : `Pergunta: ${question}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system:
          'Responda em TEXTO SIMPLES, sem formatação Markdown: sem **, ##, listas ' +
          'formatadas, blocos de código ou links em sintaxe. Apenas texto corrido, ' +
          'preservando quebras de linha naturais.',
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: 'Upstream error', details: text.slice(0, 500) });
    }

    const data = await response.json();
    const answer = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return res.json({ answer });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`PocketRAG server listening on port ${PORT}`);
});