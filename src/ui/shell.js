/**
 * Application chrome: title bar with the application menu and quick access
 * toolbar, ribbon slot, options bar, docked Properties and Project Browser,
 * view tabs, the canvas with navigation bar and orientation cube, the view
 * control bar, the status bar and the phone toolbar.
 */
import { h, MOD } from './dom.js';
import { icon } from './icons.js';
import { commandTip } from './ribbon.js';

export function buildShell(app) {
  const qat = (cmd, size = 17) => {
    const d = app.commandDef(cmd);
    return h('button.icon-btn.qat-btn', { type: 'button', 'aria-label': d.label, ...commandTip(d), onClick: () => app.run(cmd) }, icon(d.icon, size));
  };
  const undoBtn = qat('undo');
  const redoBtn = qat('redo');
  const appBtn = h('button.app-btn', { type: 'button', 'aria-label': 'Menu Arquivo', 'aria-haspopup': 'menu', 'data-tip': 'Arquivo', onClick: (e) => app.appMenu(e.currentTarget) }, icon('logo', 16), h('span', 'Arquivo'));
  const title = h('div.title', { 'aria-live': 'polite' });
  const search = h(
    'button.search-btn',
    { type: 'button', 'aria-haspopup': 'dialog', 'aria-keyshortcuts': `${MOD === 'Cmd' ? 'Meta' : 'Control'}+K`, 'data-tip': 'Pesquisar comandos', 'data-tip-keys': `${MOD}+K`, onClick: () => app.run('search') },
    icon('search', 15),
    h('span.search-text', 'Pesquisar comandos'),
    h('kbd', `${MOD} K`),
  );
  const themeBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Tema', 'aria-haspopup': 'menu', 'data-tip': 'Tema', onClick: (e) => app.themeMenu(e.currentTarget) }, icon('monitor', 17));
  const helpBtn = h('button.icon-btn.hide-phone', { type: 'button', 'aria-label': 'Ajuda', 'data-tip': 'Ajuda', 'data-tip-keys': 'F1', onClick: () => app.run('help') }, icon('help', 17));
  const titlebar = h(
    'header.titlebar',
    h(
      'div.tb-left',
      appBtn,
      h(
        'div.qat',
        { role: 'toolbar', 'aria-label': 'Acesso rápido' },
        h('span.hide-phone', { style: { display: 'contents' } }, qat('open'), qat('save')),
        undoBtn,
        redoBtn,
        h('span.qat-sep.hide-phone'),
        h('span.hide-phone', { style: { display: 'contents' } }, qat('measure'), qat('dimension'), qat('text'), h('span.qat-sep'), qat('view3d'), qat('section'), qat('thinLines'), qat('closeInactive')),
      ),
    ),
    title,
    h('div.tb-right', search, themeBtn, helpBtn),
  );

  const optionsbar = h('div.optionsbar', { role: 'toolbar', 'aria-label': 'Opções' });

  // Docked panes
  const propsTitle = h('h2.pane-title', { id: 'props-title' }, 'Propriedades');
  const propsClose = h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Ocultar Propriedades', 'data-tip': 'Ocultar Propriedades', onClick: () => app.togglePane('props') }, icon('x', 15));
  const propsBody = h('div.pane-body');
  const paneProps = h('section.pane.pane-props', { 'aria-labelledby': 'props-title' }, h('div.pane-head', propsTitle, propsClose), propsBody);
  const browserTitle = h('h2.pane-title', { id: 'browser-title' }, 'Navegador de Projeto');
  const browserClose = h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Ocultar Navegador de Projeto', 'data-tip': 'Ocultar Navegador de Projeto', onClick: () => app.togglePane('browser') }, icon('x', 15));
  const browserBody = h('div.pane-body');
  const browserSearch = h('input.input', { type: 'search', placeholder: 'Pesquisar vistas, pranchas e tipos', 'aria-label': 'Pesquisar no navegador de projeto' });
  const paneBrowser = h('section.pane.pane-browser', { 'aria-labelledby': 'browser-title' }, h('div.pane-head', browserTitle, browserClose), h('div.browser-search', browserSearch), browserBody);
  const dockSplit = h('div.dock-split', { role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'Redimensionar Propriedades e Navegador de Projeto', 'aria-valuemin': '15', 'aria-valuemax': '85', 'aria-valuenow': '52', tabindex: '0' });
  const dock = h('aside.dock', { 'aria-label': 'Propriedades e Navegador de Projeto' }, paneProps, dockSplit, paneBrowser);
  const dockResize = h('div.dock-resize', { role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Redimensionar painel lateral', 'aria-valuemin': '200', 'aria-valuemax': '560', 'aria-valuenow': '290', tabindex: '0' });

  // Views
  const vtabs = h('div.vtabs', { role: 'tablist', 'aria-label': 'Vistas abertas' });
  const glCanvas = h('canvas.gl-canvas', { 'aria-hidden': 'true' });
  const overlay = h('canvas.overlay-canvas', {
    tabindex: '0',
    role: 'application',
    'aria-label': 'Vista do modelo. Use a faixa de opções ou atalhos de duas letras para iniciar ferramentas. Pressione F1 para ajuda.',
    'aria-describedby': 'canvas-help',
  });
  const canvasHelp = h('p.sr-only#canvas-help', 'Clique para selecionar elementos; arraste para selecionar vários. Setas movem a seleção. Botão do meio ou dois dedos fazem panorâmica; a roda ou pinça dá zoom. Em vistas 3D arraste com o botão direito ou um dedo para orbitar.');
  const domView = h('div.dom-view', { hidden: true });
  const nav = h('div.navbar', { role: 'toolbar', 'aria-label': 'Navegação', 'aria-orientation': 'vertical' });
  const cubeInner = h('div.vc-cube');
  const viewcube = h('div.viewcube', { hidden: true, role: 'group', 'aria-label': 'Orientação da vista' }, h('div.vc-ring'), cubeInner);
  const banner = h('div.view-banner', { hidden: true, role: 'status' });
  const canvasWrap = h('div.canvas-wrap', glCanvas, overlay, canvasHelp, domView, nav, viewcube, banner);
  const viewbar = h('div.viewbar', { role: 'toolbar', 'aria-label': 'Controles da vista' });
  const viewarea = h('div.viewarea', vtabs, canvasWrap, viewbar);
  const main = h('div.main', dock, dockResize, viewarea);

  // Status bar
  const prompt = h('div.sb-prompt', { role: 'status', 'aria-live': 'polite' });
  const selInfo = h('span.sb-item', { 'aria-live': 'polite' });
  const snapBtn = h('button.sb-item', { type: 'button', 'aria-pressed': 'true', 'data-tip': 'Aderências', 'data-tip-desc': 'Aderir a pontas, pontos médios, interseções e ângulos', onClick: () => app.toggleSnaps() }, icon('magnet', 14), h('span', 'Aderências'));
  const coords = h('span.sb-item.sb-coords', { 'aria-hidden': 'true' });
  const statusbar = h('footer.statusbar', prompt, selInfo, snapBtn, coords);

  const phonebar = h('nav.phonebar', { 'aria-label': 'Ferramentas' });
  const root = h('div.app-root', titlebar, h('div.ribbon-slot', { style: { display: 'contents' } }), optionsbar, main, statusbar, phonebar);
  return {
    root,
    titlebar,
    title,
    themeBtn,
    undoBtn,
    redoBtn,
    optionsbar,
    dock,
    dockSplit,
    dockResize,
    main,
    propsBody,
    propsTitle,
    browserBody,
    browserSearch,
    vtabs,
    glCanvas,
    overlay,
    domView,
    nav,
    viewcube,
    cubeInner,
    banner,
    canvasWrap,
    viewbar,
    prompt,
    selInfo,
    snapBtn,
    coords,
    phonebar,
  };
}

/** Faces of the orientation cube (original layout): world axes per face. */
export const CUBE_FACES = [
  { id: 'top', label: 'TOPO', u: [1, 0, 0], v: [0, -1, 0], c: [0, 0, 1], yaw: -Math.PI / 2, pitch: Math.PI / 2 - 0.0001 },
  { id: 'bottom', label: 'BASE', u: [1, 0, 0], v: [0, 1, 0], c: [0, 0, -1], yaw: -Math.PI / 2, pitch: -Math.PI / 2 + 0.0001 },
  { id: 'south', label: 'SUL', u: [1, 0, 0], v: [0, 0, -1], c: [0, -1, 0], yaw: -Math.PI / 2, pitch: 0 },
  { id: 'north', label: 'NORTE', u: [-1, 0, 0], v: [0, 0, -1], c: [0, 1, 0], yaw: Math.PI / 2, pitch: 0 },
  { id: 'east', label: 'LESTE', u: [0, 1, 0], v: [0, 0, -1], c: [1, 0, 0], yaw: 0, pitch: 0 },
  { id: 'west', label: 'OESTE', u: [0, -1, 0], v: [0, 0, -1], c: [-1, 0, 0], yaw: Math.PI, pitch: 0 },
];

export function buildCube(app, inner, viewcube) {
  const half = 20;
  for (const f of CUBE_FACES) {
    const n = [f.v[1] * f.u[2] - f.v[2] * f.u[1], f.v[2] * f.u[0] - f.v[0] * f.u[2], f.v[0] * f.u[1] - f.v[1] * f.u[0]];
    const m = [f.u[0], f.u[1], f.u[2], 0, f.v[0], f.v[1], f.v[2], 0, n[0], n[1], n[2], 0, f.c[0] * half, f.c[1] * half, f.c[2] * half, 1];
    const btn = h('button.vc-face', { type: 'button', 'aria-label': `Vista de ${f.label.toLowerCase()}`, onClick: () => app.orient3D(f.yaw, f.pitch) }, f.label);
    btn.style.transform = `matrix3d(${m.join(',')})`;
    inner.append(btn);
  }
  viewcube.append(
    h('button.icon-btn.vc-home', { type: 'button', 'aria-label': 'Vista inicial', 'data-tip': 'Vista inicial', onClick: () => app.orient3D(-0.85, 0.55, true) }, icon('home', 15)),
  );
}
