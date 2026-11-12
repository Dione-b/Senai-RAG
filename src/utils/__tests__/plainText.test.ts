import { describe, expect, it } from 'vitest';
import { toPlainText } from '../plainText';

describe('toPlainText (markdown → texto simples)', () => {
  it('remove negrito e itálico', () => {
    expect(toPlainText('Prazo **termina no fim** de abril')).toBe('Prazo termina no fim de abril');
    expect(toPlainText('com *ênfase* aqui')).toBe('com ênfase aqui');
    expect(toPlainText('***ambos***')).toBe('ambos');
  });

  it('remove marcadores de título e citação', () => {
    expect(toPlainText('## Resposta\nTexto')).toBe('Resposta\nTexto');
    expect(toPlainText('> citação direta')).toBe('citação direta');
  });

  it('converte links para texto com URL entre parênteses', () => {
    expect(toPlainText('veja [documentação](https://exemplo.com/docs)')).toBe(
      'veja documentação (https://exemplo.com/docs)',
    );
  });

  it('remove cercas de código (bloco e inline)', () => {
    expect(toPlainText('```js\ncódigo\n```')).toBe('código');
    expect(toPlainText('use `npm run build`')).toBe('use npm run build');
  });

  it('preserva listas e quebras de linha', () => {
    const md = '- item um\n- item dois';
    expect(toPlainText(md)).toBe('- item um\n- item dois');
    expect(toPlainText('linha um\nlinha dois')).toBe('linha um\nlinha dois');
  });

  it('texto sem markdown passa inalterado', () => {
    expect(toPlainText('Resposta simples em português.')).toBe('Resposta simples em português.');
  });

  it('remove riscado e regras horizontais', () => {
    expect(toPlainText('~~antigo~~ novo')).toBe('antigo novo');
    expect(toPlainText('antes\n---\ndepois')).toBe('antes\n\ndepois');
  });

  it('não quebra texto com asterisco solto', () => {
    expect(toPlainText('5 * 3 = 15')).toBe('5 * 3 = 15');
    expect(toPlainText('2 * 2')).toBe('2 * 2');
  });
});
