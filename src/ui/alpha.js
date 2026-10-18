/**
 * First-run notice that the app is an early alpha. Shown once per browser,
 * dismissible, and never blocks the interface.
 */
import { h } from './dom.js';
import { icon } from './icons.js';

const KEY = 'bd.alphaNoticeSeen';

export function showAlphaNotice() {
  try {
    if (localStorage.getItem(KEY)) return;
  } catch {
    return;
  }
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    node.remove();
  };
  const node = h(
    'aside.alpha-notice',
    { role: 'region', 'aria-label': 'Aviso de versão alpha' },
    h('span.alpha-icon', icon('warning', 18)),
    h(
      'div.alpha-body',
      h('h2', 'Versão Alpha'),
      h('p', 'O BIMDesign está em desenvolvimento inicial. Os recursos podem mudar e os dados do projeto podem ser perdidos. Mantenha cópias dos trabalhos importantes.'),
      h('div.alpha-actions', h('button.btn.sm.primary', { type: 'button', onClick: dismiss }, 'Entendi')),
    ),
  );
  document.body.append(node);
}
