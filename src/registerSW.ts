/**
 * Registra o service worker do PWA.
 * Só roda no build de produção: em dev o SW quebraria o HMR do Vite.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // Na primeira visita não há controller; o SW assume o controle na
  // próxima navegação (sem recarregar a página no meio do uso).
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err: unknown) => {
        console.error('Falha ao registrar o service worker:', err);
      });
  });

  // Aplica uma atualização do SW assim que o usuário voltar à aba.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    navigator.serviceWorker.getRegistration().then((registration) => {
      registration?.update().catch(() => {
        // offline: tenta de novo no próximo load
      });
    });
  });
}
