/**
 * Ribbon layout: tabs of panels with large buttons, stacks of small buttons
 * and split buttons with variants.
 *   { cmd, size: 'lg' } | { cmd } (small) | { cmd, variants: [{ cmd, label }] }
 */
export const RIBBON = [
  {
    id: 'arch',
    label: 'Arquitetura',
    panels: [
      { title: 'Selecionar', items: [{ cmd: 'modify', size: 'lg' }] },
      {
        title: 'Construir',
        items: [
          {
            cmd: 'wall',
            size: 'lg',
            variants: [
              { cmd: 'wall', label: 'Parede' },
              { cmd: 'wallStructural', label: 'Parede Estrutural' },
              { cmd: 'opening', label: 'Abertura em Parede' },
            ],
          },
          { cmd: 'door', size: 'lg' },
          { cmd: 'window', size: 'lg' },
          { cmd: 'component', size: 'lg' },
          { cmd: 'column', size: 'lg' },
          { cmd: 'roof', size: 'lg' },
          { cmd: 'ceiling', size: 'lg' },
          { cmd: 'floor', size: 'lg' },
          { cmd: 'curtainWall', size: 'lg' },
        ],
      },
      { title: 'Circulação', items: [{ cmd: 'railing', size: 'lg' }, { cmd: 'stair', size: 'lg' }] },
      { title: 'Ambiente', items: [{ cmd: 'room', size: 'lg' }, { cmd: 'roomSeparator', size: 'lg' }, { cmd: 'rooms-auto' }, { cmd: 'tag' }, { cmd: 'roomFill' }] },
      { title: 'Abertura', items: [{ cmd: 'opening', size: 'lg' }, { cmd: 'shaft', size: 'lg' }] },
      { title: 'Referência', items: [{ cmd: 'level', size: 'lg' }, { cmd: 'grid', size: 'lg' }] },
    ],
  },
  {
    id: 'struct',
    label: 'Estrutura',
    panels: [
      { title: 'Estrutura', items: [{ cmd: 'beam', size: 'lg' }, { cmd: 'wallStructural', size: 'lg' }, { cmd: 'column', size: 'lg' }, { cmd: 'floor', size: 'lg' }] },
      { title: 'Referência', items: [{ cmd: 'level', size: 'lg' }, { cmd: 'grid', size: 'lg' }] },
    ],
  },
  {
    id: 'insert',
    label: 'Inserir',
    panels: [
      { title: 'Importar', items: [{ cmd: 'importDxf', size: 'lg' }] },
      { title: 'Projeto', items: [{ cmd: 'open', size: 'lg' }, { cmd: 'sample', size: 'lg' }] },
      { title: 'Biblioteca', items: [{ cmd: 'component', size: 'lg' }, { cmd: 'types', size: 'lg' }] },
    ],
  },
  {
    id: 'annotate',
    label: 'Anotar',
    panels: [
      { title: 'Cota', items: [{ cmd: 'dimension', size: 'lg' }, { cmd: 'measure', size: 'lg' }] },
      { title: 'Detalhe', items: [{ cmd: 'detailLine', size: 'lg' }, { cmd: 'region', size: 'lg' }] },
      { title: 'Texto', items: [{ cmd: 'text', size: 'lg' }] },
      { title: 'Etiqueta', items: [{ cmd: 'tag', size: 'lg' }, { cmd: 'tagAll', size: 'lg' }] },
    ],
  },
  {
    id: 'view',
    label: 'Vista',
    panels: [
      { title: 'Gráficos', items: [{ cmd: 'visibility', size: 'lg' }, { cmd: 'thinLines' }, { cmd: 'revealHidden' }, { cmd: 'tempReset' }] },
      {
        title: 'Criar',
        items: [
          { cmd: 'view3d', size: 'lg', variants: [{ cmd: 'view3d', label: 'Vista 3D Padrão' }, { cmd: 'newView3d', label: 'Nova Vista 3D' }] },
          { cmd: 'section', size: 'lg' },
          { cmd: 'elevation', size: 'lg' },
          { cmd: 'planViews', size: 'lg' },
          { cmd: 'duplicateView', size: 'lg' },
          { cmd: 'schedule', size: 'lg' },
        ],
      },
      { title: 'Composição de Pranchas', items: [{ cmd: 'sheet', size: 'lg' }, { cmd: 'placeView', size: 'lg' }] },
      { title: 'Janelas', items: [{ cmd: 'closeInactive' }, { cmd: 'toggleProps' }, { cmd: 'toggleBrowser' }] },
      { title: 'Navegar', items: [{ cmd: 'zoomFit' }, { cmd: 'zoomRegion' }, { cmd: 'sectionBox' }] },
    ],
  },
  {
    id: 'manage',
    label: 'Gerenciar',
    panels: [
      { title: 'Configurações', items: [{ cmd: 'projectInfo', size: 'lg' }, { cmd: 'units', size: 'lg' }, { cmd: 'materials', size: 'lg' }, { cmd: 'snaps', size: 'lg' }] },
      { title: 'Projeto', items: [{ cmd: 'levels', size: 'lg' }, { cmd: 'types', size: 'lg' }, { cmd: 'purge', size: 'lg' }] },
      { title: 'Ajuda', items: [{ cmd: 'shortcuts', size: 'lg' }, { cmd: 'help', size: 'lg' }] },
    ],
  },
  {
    id: 'modify',
    label: 'Modificar',
    panels: [
      { title: 'Selecionar', items: [{ cmd: 'modify', size: 'lg' }] },
      { title: 'Área de Transferência', items: [{ cmd: 'paste', size: 'lg' }, { cmd: 'copyClip' }, { cmd: 'cutClip' }] },
      MODIFY_PANEL(),
      { title: 'Vista', items: [{ cmd: 'hideEl' }, { cmd: 'tempIsolate' }, { cmd: 'tempHide' }] },
      { title: 'Medir', items: [{ cmd: 'measure', size: 'lg' }, { cmd: 'dimension', size: 'lg' }] },
      { title: 'Criar', items: [{ cmd: 'matchType', size: 'lg' }] },
    ],
  },
];

export function MODIFY_PANEL() {
  return {
    title: 'Modificar',
    items: [
      { cmd: 'align', small: true },
      { cmd: 'offset', small: true },
      { cmd: 'mirrorPick', small: true },
      { cmd: 'move', small: true },
      { cmd: 'copy', small: true },
      { cmd: 'rotate', small: true },
      { cmd: 'trim', small: true },
      { cmd: 'extend', small: true },
      { cmd: 'split', small: true },
      { cmd: 'array', small: true },
      { cmd: 'mirrorDraw', small: true },
      { cmd: 'pin', small: true },
      { cmd: 'unpin', small: true },
      { cmd: 'delete', small: true },
    ],
  };
}

/** Panels of the contextual tab for a selection of one category. */
export function contextualPanels(kinds) {
  const panels = [{ title: 'Propriedades', items: [{ cmd: 'editType', size: 'lg' }] }, MODIFY_PANEL()];
  const k = kinds.length === 1 ? kinds[0] : null;
  if (k === 'wall') panels.push({ title: 'Parede', items: [{ cmd: 'flip', size: 'lg' }, { cmd: 'attachTop', size: 'lg' }, { cmd: 'detachTop', size: 'lg' }] });
  if (k === 'door' || k === 'window') panels.push({ title: 'Abertura', items: [{ cmd: 'flip', size: 'lg' }] });
  if (k === 'floor' || k === 'roof' || k === 'ceiling' || k === 'railing') panels.push({ title: 'Modo', items: [{ cmd: 'editBoundary', size: 'lg' }] });
  panels.push({ title: 'Vista', items: [{ cmd: 'hideEl' }, { cmd: 'hideCat' }, { cmd: 'tempIsolate' }, { cmd: 'tempHide' }, { cmd: 'selectSimilar' }] });
  return panels;
}
