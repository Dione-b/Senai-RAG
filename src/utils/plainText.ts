/**
 * Converte respostas com sintaxe Markdown em texto simples para exibição.
 * Não é um parser completo: remove as decorações mais comuns que o modelo
 * gera (negrito, títulos, links, código), preservando quebras e listas.
 */
export function toPlainText(markdown: string): string {
  return (
    markdown
      // imagens ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // links [texto](url) → texto (url)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
      // títulos "## ..." e citações "> ..." no início da linha
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      // regras horizontais (---, ***, ___)
      .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
      // código em bloco: remove cercas ```lang
      .replace(/```[a-zA-Z]*\n?/g, '')
      // negrito+itálico e negrito
      .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      // itálico
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/\b_([^_\n]+)_\b/g, '$1')
      // texto riscado
      .replace(/~~([^~]+)~~/g, '$1')
      // código inline: `código` → código
      .replace(/`([^`]+)`/g, '$1')
      // espaços no fim de cada linha
      .replace(/[ \t]+$/gm, '')
      .trim()
  );
}
