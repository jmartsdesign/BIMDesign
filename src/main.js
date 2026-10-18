// CSS is loaded via <link> tags in index.html (works without Vite).
import { App } from './app.js';
import { showAlphaNotice } from './ui/alpha.js';

const root = document.getElementById('app');
const app = new App(root);
// import.meta.env is provided by Vite; guard for plain file:// or static serving.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

if (env.DEV) window.bd = app;
app
  .start()
  .catch((err) => {
    console.error(err);
    const msg = /WebGL2/.test(err?.message) ? 'Este navegador não suporta WebGL2, que o BIMDesign precisa para desenhar. Tente uma versão recente do Chrome, Edge, Firefox ou Safari.' : 'Algo deu errado ao iniciar. Recarregue a página para tentar novamente.';
    root.textContent = msg;
    root.classList.add('fatal');
  })
  .finally(() => showAlphaNotice());

if ('serviceWorker' in navigator && env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Hand the worker this build's files so the app works offline.
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && u.includes('/assets/'));
        reg.active?.postMessage({ type: 'precache', urls });
      })
      .catch(() => {});
  });
}
