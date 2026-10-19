/**
 * Command registry. Every ribbon button, menu item, keyboard shortcut and
 * command search entry runs a command by name.
 *
 *   { label, icon, run(app, args), enabled(app), keys: 'WA' (typed letters),
 *     accel: 'Ctrl+S', desc, search: extra search words }
 */
import {
  WallTool,
  HostedTool,
  ComponentTool,
  LineTool,
  SketchTool,
  StairTool,
  RampTool,
  RoomTool,
  DimensionTool,
  TextTool,
  TagTool,
  SectionTool,
  ElevationTool,
  LevelTool,
  TopographyTool,
  placeRoomsAutomatically,
  tagAll,
} from './editor/draw.js';
import {
  MoveTool,
  RotateTool,
  MirrorTool,
  ArrayTool,
  AlignTool,
  OffsetTool,
  TrimTool,
  SplitTool,
  MeasureTool,
  MatchTypeTool,
  ZoomRegionTool,
} from './editor/modify.js';
import { deleteElements, uniqueName } from './core/ops.js';
import { planView } from './core/template.js';
import { terrainCutFill, withTerrainModifier } from './core/topography.js';
import { formatVolume } from './core/units.js';

const tool = (Cls, opts = {}) => (app, args) => app.startTool(Cls, { ...opts, ...(args || {}) });
const hasSel = (app) => app.selection.size > 0;
const requireFloorPlan = (app) => {
  if (app.activeView?.kind === 'plan') return true;
  const plan = app.doc.all('plan').find((view) => view.levelId === app.activeLevelId()) || app.doc.all('plan')[0];
  if (plan) {
    app.openView(plan.id);
    return true;
  }
  return app.requirePlan();
};
const terrainBoolean = (app, operation) => {
  const selected = [...app.selection].map((id) => app.doc.get(id)).filter(Boolean);
  const terrain = selected.find((el) => el.kind === 'topography');
  const structure = selected.find((el) => el.kind !== 'topography');
  if (!terrain || !structure || selected.length !== 2) return app.toast('Selecione um terreno e um elemento estrutural para executar a operação.', { kind: 'error' });
  let patch;
  try {
    patch = withTerrainModifier(app.doc, terrain, structure, operation);
  } catch (err) {
    return app.toast(err.message || 'Não foi possível modificar o terreno.', { kind: 'error' });
  }
  const result = app.commit(operation === 'union' ? 'Unir estrutura ao terreno' : 'Subtrair estrutura do terreno', () => app.doc.update(terrain.id, patch));
  if (result) app.toast(operation === 'union' ? 'Pegada estrutural unida à superfície do terreno.' : 'Pegada estrutural subtraída do terreno.', { kind: 'success' });
};
const terrainCutFillReport = (app) => {
  const selected = [...app.selection].map((id) => app.doc.get(id)).filter((el) => el?.kind === 'topography');
  if (selected.length !== 2) return app.toast('Selecione dois terrenos: um Existente e outro Proposto.', { kind: 'error' });
  const existing = selected.find((el) => el.role === 'existing');
  const proposed = selected.find((el) => el.role === 'proposed');
  if (!existing || !proposed) return app.toast('Defina um terreno como Existente e o outro como Proposto nas propriedades.', { kind: 'error' });
  const result = terrainCutFill(existing, proposed);
  app.toast(`Corte: ${formatVolume(result.cut, app.doc.units)} · Aterro: ${formatVolume(result.fill, app.doc.units)} · Saldo (aterro − corte): ${formatVolume(result.net, app.doc.units)}.`, { kind: 'success', timeout: 0 });
};

export const COMMANDS = {
  // Arquivos
  new: { label: 'Novo Projeto', icon: 'file-plus', accel: 'Ctrl+N', run: (app) => app.newProjectDialog() },
  open: { label: 'Abrir', icon: 'folder-open', accel: 'Ctrl+O', run: (app) => app.openDialog() },
  save: { label: 'Salvar', icon: 'save', accel: 'Ctrl+S', run: (app) => app.save() },
  saveAs: { label: 'Salvar Como', icon: 'save-all', accel: 'Ctrl+Shift+S', run: (app) => app.saveAs() },
  export: { label: 'Exportar', icon: 'download', run: (app, args) => app.exportDialog(args?.format) },
  print: { label: 'Imprimir ou Exportar PDF', icon: 'printer', accel: 'Ctrl+P', run: (app) => app.exportDialog('pdf') },
  home: { label: 'Início', icon: 'house', run: (app) => app.showHome() },
  sample: { label: 'Abrir Projeto de Exemplo', icon: 'house', run: (app) => app.startProject('sample') },
  importDxf: { label: 'Importar CAD (DXF)', icon: 'importCad', run: (app) => app.importDXF(), desc: 'Trazer linhas e textos de um desenho DXF para a vista ativa, para decalcar' },
  importTopography: { label: 'Importar Topografia TXT/CSV', icon: 'topography', run: (app) => app.importTopography(), desc: 'Importar pontos XYZ e curvas de nível de ficheiros delimitados' },

  // Editar
  undo: { label: 'Desfazer', icon: 'undo', accel: 'Ctrl+Z', run: (app) => app.undo(), enabled: (app) => app.doc?.canUndo },
  redo: { label: 'Refazer', icon: 'redo', accel: 'Ctrl+Y', run: (app) => app.redo(), enabled: (app) => app.doc?.canRedo },
  copyClip: { label: 'Copiar para a Área de Transferência', icon: 'copy', accel: 'Ctrl+C', run: (app) => app.copyToClipboard(), enabled: hasSel },
  cutClip: { label: 'Recortar para a Área de Transferência', icon: 'scissors', accel: 'Ctrl+X', run: (app) => app.copyToClipboard(true), enabled: hasSel },
  paste: { label: 'Colar', icon: 'paste', accel: 'Ctrl+V', run: (app) => app.paste(), enabled: (app) => !!app.clipboard },
  selectAll: { label: 'Selecionar Tudo na Vista', icon: 'pointer', accel: 'Ctrl+A', run: (app) => app.selectAllInView() },
  delete: {
    label: 'Excluir',
    icon: 'delete',
    keys: 'DE',
    accel: 'Delete',
    enabled: hasSel,
    run: (app) => {
      const ids = [...app.selection].filter((id) => !app.doc.get(id)?.pinned);
      if (!ids.length) return app.toast('Elementos fixados não podem ser excluídos. Desfixe-os primeiro.', { kind: 'error' });
      let n = 0;
      app.commit('Excluir', () => (n = deleteElements(app.doc, ids).size));
      app.select([]);
      app.setPrompt(`Excluídos ${n} elemento${n === 1 ? '' : 's'}.`);
    },
  },
  pin: { label: 'Fixar', icon: 'pin', keys: 'PN', enabled: hasSel, run: (app) => app.commit('Fixar', () => app.selection.forEach((id) => app.doc.update(id, { pinned: true }))) },
  unpin: { label: 'Desfixar', icon: 'unpin', keys: 'UP', enabled: hasSel, run: (app) => app.commit('Desfixar', () => app.selection.forEach((id) => app.doc.update(id, { pinned: false }))) },
  modify: { label: 'Modificar', icon: 'modify', run: (app) => (app.cancelTool(), app.select([])), desc: 'Selecionar e editar elementos' },

  // Arquitetura
  wall: { label: 'Parede', icon: 'wall', keys: 'WA', run: tool(WallTool), desc: 'Desenhar paredes' },
  wallStructural: { label: 'Parede Estrutural', icon: 'wallStructural', run: tool(WallTool, { structural: true }) },
  curtainWall: {
    label: 'Parede Cortina',
    icon: 'curtainWall',
    run: (app) => {
      const t = app.doc.all('wallType').find((x) => x.curtain);
      if (t) app.setCurrentType('wall', t.id);
      app.startTool(WallTool, {});
    },
  },
  door: { label: 'Porta', icon: 'door', keys: 'DR', run: tool(HostedTool, { kind: 'door' }), desc: 'Colocar portas em paredes' },
  window: { label: 'Janela', icon: 'window', keys: 'WN', run: tool(HostedTool, { kind: 'window' }), desc: 'Colocar janelas em paredes' },
  shaft: { label: 'Abertura de Shaft', icon: 'shaft', run: tool(SketchTool, { kind: 'shaft' }), desc: 'Cortar uma abertura através do piso acima e do forro deste pavimento' },
  opening: { label: 'Abertura em Parede', icon: 'opening', run: tool(HostedTool, { kind: 'opening' }), desc: 'Cortar uma abertura retangular em uma parede' },
  component: { label: 'Componente', icon: 'component', keys: 'CM', run: tool(ComponentTool, { kind: 'component' }), desc: 'Colocar móveis, louças e equipamentos' },
  column: { label: 'Pilar', icon: 'column', keys: 'CL', run: tool(ComponentTool, { kind: 'column' }) },
  beam: { label: 'Viga', icon: 'beam', keys: 'BM', run: tool(LineTool, { kind: 'beam' }) },
  floor: { label: 'Piso', icon: 'floor', keys: 'SB', run: tool(SketchTool, { kind: 'floor' }), desc: 'Desenhar o contorno de um piso' },
  ceiling: { label: 'Forro', icon: 'ceiling', run: tool(SketchTool, { kind: 'ceiling' }) },
  roof: { label: 'Cobertura', icon: 'roof', run: tool(SketchTool, { kind: 'roof' }), desc: 'Cobertura por pegada' },
  stair: { label: 'Escada', icon: 'stair', run: tool(StairTool) },
  ramp: { label: 'Rampa', icon: 'ramp', keys: 'RA', run: tool(RampTool), desc: 'Desenhar uma rampa entre dois níveis' },
  topographyDraw: { label: 'Desenhar Terreno', icon: 'topography', run: (app) => requireFloorPlan(app) && app.startTool(TopographyTool), desc: 'Criar uma superfície topográfica por curvas de nível ou limite poligonal' },
  sitePlan: {
    label: 'Planta de Implantação',
    icon: 'planView',
    run: (app) => {
      const level = app.doc.get(app.activeLevelId()) || app.doc.levels()[0];
      if (!level) return app.toast('Crie primeiro um pavimento para a planta de implantação.', { kind: 'error' });
      let view = app.doc.all('plan').find((v) => v.sitePlan && v.levelId === level.id);
      if (!view) {
        app.commit('Criar Planta de Implantação', () => {
          view = app.doc.add({ ...planView(app.doc, level), name: uniqueName(app.doc.all('plan').map((v) => v.name), 'Planta de Implantação'), sitePlan: true, underlay: null });
        });
      }
      app.openView(view.id);
    },
  },
  terrainUnion: { label: 'Unir Estrutura ao Terreno', icon: 'topography', enabled: (app) => app.selection.size === 2, run: (app) => terrainBoolean(app, 'union') },
  terrainSubtract: { label: 'Subtrair Estrutura do Terreno', icon: 'topography', enabled: (app) => app.selection.size === 2, run: (app) => terrainBoolean(app, 'subtract') },
  terrainCutFill: { label: 'Calcular Corte e Aterro', icon: 'topography', enabled: hasSel, run: terrainCutFillReport },
  railing: { label: 'Guarda-corpo', icon: 'railing', run: tool(SketchTool, { kind: 'railing' }) },
  room: { label: 'Ambiente', icon: 'room', keys: 'RM', run: tool(RoomTool) },
  roomSeparator: { label: 'Separador de Ambientes', icon: 'roomSeparator', run: tool(LineTool, { kind: 'roomSeparator' }) },
  'rooms-auto': { label: 'Colocar Ambientes Automaticamente', icon: 'room', run: (app) => (app.requirePlan() ? placeRoomsAutomatically(app) : null) },
  roomFill: { label: 'Preenchimento de Ambientes', icon: 'palette', run: (app) => app.toggleViewProp('roomFill') },
  level: { label: 'Pavimento', icon: 'level', keys: 'LL', run: (app) => app.levelCommand() },
  grid: { label: 'Eixo', icon: 'grid', keys: 'GR', run: tool(LineTool, { kind: 'grid' }) },

  // Anotar
  dimension: { label: 'Cota Alinhada', icon: 'dimAligned', keys: 'DI', run: tool(DimensionTool) },
  text: { label: 'Texto', icon: 'text', keys: 'TX', run: tool(TextTool) },
  detailLine: { label: 'Linha de Detalhe', icon: 'detailLine', keys: 'DL', run: tool(LineTool, { kind: 'detailLine' }) },
  region: { label: 'Região Preenchida', icon: 'boundary', keys: 'FR', run: tool(SketchTool, { kind: 'region' }), desc: 'Desenhar uma área hachurada ou sólida na vista' },
  tag: { label: 'Etiqueta por Categoria', icon: 'tag', keys: 'TG', run: tool(TagTool) },
  tagAll: { label: 'Etiquetar Todos os Não Etiquetados', icon: 'tagAll', run: (app) => tagAll(app) },

  // Modificar
  move: { label: 'Mover', icon: 'move', keys: 'MV', enabled: hasSel, run: tool(MoveTool) },
  copy: { label: 'Copiar', icon: 'copyEl', keys: 'CO', enabled: hasSel, run: tool(MoveTool, { copy: true }) },
  rotate: { label: 'Girar', icon: 'rotate', keys: 'RO', enabled: hasSel, run: tool(RotateTool) },
  mirrorPick: { label: 'Espelhar - Escolher Eixo', icon: 'mirror', keys: 'MM', enabled: hasSel, run: tool(MirrorTool) },
  mirrorDraw: { label: 'Espelhar - Desenhar Eixo', icon: 'mirrorDraw', keys: 'DM', enabled: hasSel, run: tool(MirrorTool, { draw: true }) },
  array: { label: 'Matriz', icon: 'array', keys: 'AR', enabled: hasSel, run: tool(ArrayTool) },
  align: { label: 'Alinhar', icon: 'align', keys: 'AL', run: tool(AlignTool) },
  offset: { label: 'Deslocar', icon: 'offset', keys: 'OF', run: tool(OffsetTool) },
  trim: { label: 'Cortar/Estender até Canto', icon: 'trim', keys: 'TR', run: tool(TrimTool, { mode: 'corner' }) },
  extend: { label: 'Cortar/Estender Elemento Único', icon: 'trimSingle', run: tool(TrimTool, { mode: 'single' }) },
  split: { label: 'Dividir Elemento', icon: 'split', keys: 'SL', run: tool(SplitTool) },
  measure: { label: 'Medir', icon: 'measure', keys: 'ME', run: tool(MeasureTool) },
  matchType: { label: 'Copiar Tipo', icon: 'matchType', keys: 'MA', run: tool(MatchTypeTool) },
  flip: { label: 'Inverter', icon: 'flip', enabled: hasSel, run: (app) => app.flipSelection() },
  attachTop: { label: 'Anexar Topo à Cobertura', icon: 'roof', enabled: hasSel, run: (app) => app.attachTop(true), desc: 'Estender as paredes selecionadas até a face inferior da cobertura acima delas' },
  detachTop: { label: 'Desanexar Topo', icon: 'wall', enabled: hasSel, run: (app) => app.attachTop(false) },
  editType: { label: 'Editar Tipo', icon: 'types', run: (app) => app.editTypeDialog() },
  editBoundary: { label: 'Editar Contorno', icon: 'boundary', run: (app) => app.editBoundary() },
  selectSimilar: { label: 'Selecionar Todas as Instâncias', icon: 'pointer', keys: 'SA', enabled: hasSel, run: (app, args) => app.selectSimilar(args?.scope || 'view') },

  // Vista
  visibility: { label: 'Visibilidade/Gráficos', icon: 'visibility', keys: 'VV', run: (app) => app.visibilityDialog() },
  thinLines: { label: 'Linhas Finas', icon: 'thinLines', keys: 'TL', run: (app) => app.toggleSetting('thinLines') },
  view3d: { label: 'Vista 3D Padrão', icon: 'view3d', run: (app) => app.open3D() },
  newView3d: { label: 'Nova Vista 3D', icon: 'view3d', run: (app) => app.new3DView() },
  section: { label: 'Corte', icon: 'section', run: tool(SectionTool) },
  elevation: { label: 'Elevação', icon: 'elevation', run: tool(ElevationTool) },
  levelInElevation: { label: 'Pavimento', icon: 'level', run: tool(LevelTool) },
  planViews: { label: 'Planta Baixa', icon: 'planView', run: (app) => app.planViewDialog() },
  duplicateView: { label: 'Duplicar Vista', icon: 'duplicate', run: (app, args) => app.duplicateView(args?.id) },
  schedule: { label: 'Tabela', icon: 'schedule', run: (app, args) => app.newScheduleDialog(args?.category) },
  sheet: { label: 'Prancha', icon: 'sheet', run: (app) => app.newSheet() },
  placeView: { label: 'Colocar Vista na Prancha', icon: 'sheet', run: (app) => app.placeViewDialog() },
  hideEl: { label: 'Ocultar Elemento na Vista', icon: 'hideEl', keys: 'EH', enabled: hasSel, run: (app) => app.hideInView('element') },
  hideCat: { label: 'Ocultar Categoria na Vista', icon: 'hideEl', keys: 'VH', enabled: hasSel, run: (app) => app.hideInView('category') },
  tempHide: { label: 'Ocultar Temporariamente', icon: 'hideEl', keys: 'HH', enabled: hasSel, run: (app) => app.temporary('hide') },
  tempIsolate: { label: 'Isolar Temporariamente', icon: 'isolate', keys: 'HI', enabled: hasSel, run: (app) => app.temporary('isolate') },
  tempReset: { label: 'Redefinir Ocultação/Isolamento Temporário', icon: 'refresh', keys: 'HR', run: (app) => app.temporary('reset') },
  revealHidden: { label: 'Revelar Elementos Ocultos', icon: 'reveal', keys: 'RH', run: (app) => app.toggleReveal() },
  unhideInView: { label: 'Reexibir na Vista', icon: 'eye', run: (app) => app.unhideSelected() },
  sectionBox: { label: 'Caixa de Corte', icon: 'sectionBox', keys: 'BX', run: (app) => app.toggleSectionBox() },
  zoomFit: { label: 'Zoom para Ajustar', icon: 'zoomFit', keys: 'ZF', run: (app) => app.zoomFit() },
  zoomRegion: { label: 'Zoom em Região', icon: 'zoomRegion', keys: 'ZR', run: tool(ZoomRegionTool) },
  zoomIn: { label: 'Aumentar Zoom', icon: 'zoom-in', run: (app) => app.vc?.zoomBy?.(1.5) },
  zoomOut: { label: 'Diminuir Zoom', icon: 'zoom-out', run: (app) => app.vc?.zoomBy?.(1 / 1.5) },
  closeInactive: { label: 'Fechar Vistas Inativas', icon: 'closeHidden', run: (app) => app.closeInactiveViews() },
  toggleProps: { label: 'Propriedades', icon: 'sliders', keys: 'PP', run: (app) => app.togglePane('props') },
  toggleBrowser: { label: 'Navegador de Projeto', icon: 'layers', run: (app) => app.togglePane('browser') },
  nextView: { label: 'Próxima Vista', icon: 'chevron-right', accel: 'Ctrl+Tab', run: (app) => app.cycleView(1) },

  // Gerenciar
  projectInfo: { label: 'Informações do Projeto', icon: 'info', run: (app) => app.projectInfoDialog() },
  units: { label: 'Unidades do Projeto', icon: 'units', keys: 'UN', run: (app) => app.unitsDialog() },
  materials: { label: 'Materiais', icon: 'material', run: (app) => app.materialsDialog() },
  levels: { label: 'Pavimentos', icon: 'level', run: (app) => app.levelsDialog() },
  types: { label: 'Tipos', icon: 'types', run: (app) => app.typesDialog() },
  snaps: { label: 'Aderências', icon: 'snaps', keys: 'SN', run: (app) => app.snapsDialog() },
  purge: { label: 'Limpar Não Usados', icon: 'purge', run: (app) => app.purgeDialog() },
  shortcuts: { label: 'Atalhos de Teclado', icon: 'keyboard', run: (app) => app.shortcutsDialog() },
  help: { label: 'Ajuda', icon: 'help', accel: 'F1', run: (app) => app.helpDialog() },
  about: { label: 'Sobre', icon: 'info', run: (app) => app.aboutDialog() },
  search: { label: 'Pesquisar Comandos', icon: 'search', accel: 'Ctrl+K', run: (app) => app.commandPalette() },
  theme: { label: 'Tema', icon: 'monitor', run: (app, args) => app.setTheme(args?.value) },
  // Ações usadas por botões de propriedades
  'schedule-fields': { label: 'Campos da Tabela', icon: 'sliders', run: (app, args) => app.scheduleFieldsDialog(args?.id) },
  'section-box': { label: 'Caixa de Corte', icon: 'sectionBox', run: (app) => app.toggleSectionBox() },
  'toggle-persp': {
    label: 'Perspectiva',
    icon: 'view3d',
    run: (app) => {
      const c = app.vc;
      if (!c?.is3D) return;
      c.cam.persp = c.cam.persp === false;
      app.viewChanged();
      app.renderViewbar();
      app.props.render();
      app.requestRender();
    },
  },

  // Modos de navegação (amigáveis ao toque)
  navPan: { label: 'Panorâmica', icon: 'hand', run: (app) => app.setNavMode('pan') },
  navOrbit: { label: 'Órbita', icon: 'orbit', run: (app) => app.setNavMode('orbit') },
};
