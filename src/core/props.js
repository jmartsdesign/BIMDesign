/**
 * Parameters shown in the properties palette and type editor. Each
 * descriptor: { key, label, group, type, get(el, ctx), set(el, value, ctx)
 * -> patch, options(ctx), ro(el, ctx) }.
 *
 * Types: length, number, angle, text, textarea, bool, select, level,
 * levelOpt (a level or none), material, readonly, button.
 */
import { verticalExtent, openingSize, stairLayout, rampExtent } from './model.js';
import { typeThickness, KIND_LABEL } from './catalog.js';
import { roofGeometry } from './build3d.js';
import { area as polyArea, perimeter, dist } from './geom.js';
import { scaleOptions } from './units.js';
import { STAIR_SHAPES } from './stairs.js';

export const GROUPS = ['Restrições', 'Construção', 'Gráficos', 'Subjacente', 'Texto', 'Cotas', 'Estrutural', 'Dados de Identificação', 'Extensões', 'Câmera', 'Outros'];

const P = (key, label, group, type, extra = {}) => ({ key, label, group, type, ...extra });

const mark = P('mark', 'Marca', 'Dados de Identificação', 'text');
const comments = P('comments', 'Comentários', 'Dados de Identificação', 'text');

const LOCATION = [
  { value: 'center', label: 'Eixo da Parede' },
  { value: 'exterior', label: 'Face Externa' },
  { value: 'interior', label: 'Face Interna' },
];

const len = (key, label, group, extra) => P(key, label, group, 'length', extra);
const ro = (key, label, group, get, type = 'length') => P(key, label, group, 'readonly', { get, format: type });

const baseLevel = P('levelId', 'Restrição de Base', 'Restrições', 'level');
const topConstraint = P('topLevelId', 'Restrição de Topo', 'Restrições', 'levelOpt', { none: 'Desconectado' });

const INSTANCE = {
  wall: [
    P('locationLine', 'Linha de Posição', 'Restrições', 'select', { options: () => LOCATION }),
    baseLevel,
    len('baseOffset', 'Deslocamento da Base', 'Restrições'),
    topConstraint,
    len('height', 'Altura Desconectada', 'Restrições', { ro: (el) => !!el.topLevelId, get: (el, c) => (el.topLevelId ? wallHeight(el, c) : el.height) }),
    len('topOffset', 'Deslocamento do Topo', 'Restrições', { ro: (el) => !el.topLevelId }),
    P('roomBounding', 'Limite de Ambiente', 'Restrições', 'bool'),
    P('flipped', 'Invertida', 'Construção', 'bool'),
    P('joinA', 'Unir no Início', 'Construção', 'bool'),
    P('joinB', 'Unir no Fim', 'Construção', 'bool'),
    P('structural', 'Estrutural', 'Estrutural', 'bool'),
    ro('length', 'Comprimento', 'Cotas', (el) => dist(el.a, el.b)),
    ro('width', 'Largura', 'Cotas', (el, c) => typeThickness(c.doc.get(el.typeId))),
    ro('area', 'Área', 'Cotas', (el, c) => dist(el.a, el.b) * wallHeight(el, c), 'area'),
    ro('volume', 'Volume', 'Cotas', (el, c) => dist(el.a, el.b) * wallHeight(el, c) * typeThickness(c.doc.get(el.typeId)), 'volume'),
    mark,
    comments,
  ],
  door: [
    ro('level', 'Pavimento', 'Restrições', (el, c) => c.doc.get(c.doc.get(el.hostId)?.levelId)?.name ?? '', 'text'),
    ro('host', 'Hospedeiro', 'Restrições', (el, c) => c.doc.get(c.doc.get(el.hostId)?.typeId)?.name ?? '', 'text'),
    P('flipFacing', 'Inverter Face', 'Construção', 'bool'),
    P('flipHand', 'Inverter Lado', 'Construção', 'bool'),
    len('t', 'Posição ao Longo da Parede', 'Restrições'),
    ro('width', 'Largura', 'Cotas', (el, c) => openingSize(c.doc, el).width),
    ro('heightV', 'Altura', 'Cotas', (el, c) => openingSize(c.doc, el).height),
    mark,
    comments,
  ],
  window: [
    ro('level', 'Pavimento', 'Restrições', (el, c) => c.doc.get(c.doc.get(el.hostId)?.levelId)?.name ?? '', 'text'),
    len('sill', 'Altura do Peitoril', 'Restrições', { get: (el, c) => openingSize(c.doc, el).sill }),
    ro('head', 'Altura da Cabeceira', 'Restrições', (el, c) => {
      const s = openingSize(c.doc, el);
      return s.sill + s.height;
    }),
    len('t', 'Posição ao Longo da Parede', 'Restrições'),
    P('flipFacing', 'Inverter Face', 'Construção', 'bool'),
    ro('width', 'Largura', 'Cotas', (el, c) => openingSize(c.doc, el).width),
    ro('heightV', 'Altura', 'Cotas', (el, c) => openingSize(c.doc, el).height),
    mark,
    comments,
  ],
  opening: [len('width', 'Largura', 'Cotas'), len('height', 'Altura', 'Cotas'), len('sill', 'Altura do Peitoril', 'Restrições'), len('t', 'Posição ao Longo da Parede', 'Restrições')],
  floor: [
    P('levelId', 'Pavimento', 'Restrições', 'level'),
    len('offset', 'Deslocamento de Altura em Relação ao Pavimento', 'Restrições'),
    P('structural', 'Estrutural', 'Estrutural', 'bool'),
    ro('thickness', 'Espessura', 'Cotas', (el, c) => typeThickness(c.doc.get(el.typeId))),
    ro('area', 'Área', 'Cotas', (el) => slabArea(el), 'area'),
    ro('perimeter', 'Perímetro', 'Cotas', (el) => perimeter(el.boundary || [])),
    ro('volume', 'Volume', 'Cotas', (el, c) => slabArea(el) * typeThickness(c.doc.get(el.typeId)), 'volume'),
    mark,
    comments,
  ],
  ceiling: [P('levelId', 'Pavimento', 'Restrições', 'level'), len('offset', 'Deslocamento de Altura em Relação ao Pavimento', 'Restrições'), ro('area', 'Área', 'Cotas', (el) => slabArea(el), 'area'), ro('perimeter', 'Perímetro', 'Cotas', (el) => perimeter(el.boundary || [])), mark, comments],
  roof: [
    P('levelId', 'Pavimento Base', 'Restrições', 'level'),
    len('baseOffset', 'Deslocamento da Base em Relação ao Pavimento', 'Restrições'),
    P('slope', 'Inclinação (graus)', 'Construção', 'number', {
      get: (el) => (el.slopes || []).find((s) => s != null) ?? 0,
      set: (el, v) => ({ slopes: (el.slopes || el.boundary.map(() => v)).map((s) => (s == null ? null : Math.max(0, Math.min(80, +v)))) }),
    }),
    ro('thickness', 'Espessura', 'Cotas', (el, c) => typeThickness(c.doc.get(el.typeId))),
    ro('area', 'Área de Projeção', 'Cotas', (el) => polyArea(el.boundary || []), 'area'),
    ro('ridge', 'Altura da Cumeeira', 'Cotas', (el, c) => {
      try {
        const g = roofGeometry(c.doc, el);
        let mx = 0;
        for (const f of g.faces) for (const p of f.poly) if (f.plane) mx = Math.max(mx, f.plane.k * ((p[0] - f.plane.p[0]) * f.plane.m[0] + (p[1] - f.plane.p[1]) * f.plane.m[1]));
        return mx;
      } catch {
        return 0;
      }
    }),
    mark,
    comments,
  ],
  column: [
    P('levelId', 'Pavimento Base', 'Restrições', 'level'),
    len('baseOffset', 'Deslocamento da Base', 'Restrições'),
    topConstraint,
    len('topOffset', 'Deslocamento do Topo', 'Restrições', { ro: (el) => !el.topLevelId }),
    len('height', 'Altura Desconectada', 'Restrições', { ro: (el) => !!el.topLevelId }),
    P('rotation', 'Rotação', 'Restrições', 'angle'),
    P('structural', 'Estrutural', 'Estrutural', 'bool'),
    mark,
    comments,
  ],
  beam: [P('levelId', 'Pavimento de Referência', 'Restrições', 'level'), len('offset', 'Deslocamento do Topo em Relação ao Pavimento', 'Restrições'), ro('length', 'Comprimento', 'Cotas', (el) => dist(el.a, el.b)), mark, comments],
  stair: [
    P('levelId', 'Pavimento Base', 'Restrições', 'level'),
    len('baseOffset', 'Deslocamento da Base', 'Restrições'),
    P('topLevelId', 'Pavimento Superior', 'Restrições', 'levelOpt', { none: 'Desconectado' }),
    len('topOffset', 'Deslocamento do Topo', 'Restrições', { ro: (el) => !el.topLevelId }),
    len('height', 'Altura Desconectada', 'Restrições', { ro: (el) => !!el.topLevelId }),
    P('shape', 'Forma', 'Construção', 'select', { get: (el) => el.shape || 'straight', options: () => STAIR_SHAPES }),
    P('turn', 'Giro', 'Construção', 'select', {
      get: (el) => el.turn || 'left',
      options: () => [
        { value: 'left', label: 'Esquerda' },
        { value: 'right', label: 'Direita' },
      ],
    }),
    len('width', 'Largura', 'Cotas', { get: (el, c) => stairLayout(c.doc, el).width }),
    P('risers', 'Número de Degraus', 'Cotas', 'number', { get: (el, c) => stairLayout(c.doc, el).risers, set: (el, v) => ({ risers: Math.max(2, Math.round(+v)) }) }),
    ro('riserHeight', 'Altura Real do Degrau', 'Cotas', (el, c) => stairLayout(c.doc, el).riserHeight),
    len('tread', 'Profundidade do Piso', 'Cotas', { get: (el, c) => stairLayout(c.doc, el).tread }),
    ro('run', 'Comprimento da Escada', 'Cotas', (el, c) => stairLayout(c.doc, el).runLength),
    P('railings', 'Corrimãos', 'Construção', 'bool'),
    mark,
    comments,
  ],
  ramp: [
    P('levelId', 'Pavimento de Partida', 'Restrições', 'level'),
    len('baseOffset', 'Deslocamento da Base', 'Restrições'),
    P('topLevelId', 'Pavimento de Chegada', 'Restrições', 'levelOpt', { none: 'Altura Desconectada' }),
    len('topOffset', 'Deslocamento do Topo', 'Restrições', { ro: (el) => !el.topLevelId }),
    len('height', 'Altura Desconectada', 'Restrições', { ro: (el) => !!el.topLevelId }),
    len('width', 'Largura', 'Cotas', { get: (el, c) => rampExtent(c.doc, el).width }),
    len('thickness', 'Espessura', 'Construção', { get: (el, c) => rampExtent(c.doc, el).thickness }),
    P('materialId', 'Material', 'Materiais e Acabamentos', 'material'),
    ro('run', 'Comprimento em Planta', 'Cotas', (el, c) => rampExtent(c.doc, el).length),
    ro('rise', 'Desnível', 'Cotas', (el, c) => rampExtent(c.doc, el).rise),
    ro('slope', 'Inclinação (%)', 'Cotas', (el, c) => {
      const g = rampExtent(c.doc, el);
      return g.length > 0 ? (100 * g.rise) / g.length : 0;
    }, 'number'),
    ro('area', 'Área em Planta', 'Cotas', (el, c) => {
      const g = rampExtent(c.doc, el);
      return g.length * g.width;
    }, 'area'),
    mark,
    comments,
  ],
  railing: [P('levelId', 'Pavimento', 'Restrições', 'level'), len('offset', 'Deslocamento em Relação ao Pavimento', 'Restrições'), ro('length', 'Comprimento', 'Cotas', (el) => pathLength(el.path || [])), mark, comments],
  component: [
    P('levelId', 'Pavimento', 'Restrições', 'level'),
    len('offset', 'Deslocamento em Relação ao Pavimento', 'Restrições'),
    P('rotation', 'Rotação', 'Restrições', 'angle'),
    ro('wd', 'Largura', 'Cotas', (el, c) => c.doc.get(el.typeId)?.width ?? 0),
    ro('dp', 'Profundidade', 'Cotas', (el, c) => c.doc.get(el.typeId)?.depth ?? 0),
    ro('ht', 'Altura', 'Cotas', (el, c) => c.doc.get(el.typeId)?.height ?? 0),
    mark,
    comments,
  ],
  room: [
    P('name', 'Nome', 'Dados de Identificação', 'text'),
    P('number', 'Número', 'Dados de Identificação', 'text'),
    ro('level', 'Pavimento', 'Restrições', (el, c) => c.doc.get(el.levelId)?.name ?? '', 'text'),
    len('upperOffset', 'Height', 'Restrições'),
    ro('area', 'Área', 'Cotas', (el, c) => c.scene?.rooms.room(el)?.area ?? 0, 'area'),
    ro('perimeter', 'Perímetro', 'Cotas', (el, c) => c.scene?.rooms.room(el)?.perimeter ?? 0),
    ro('volume', 'Volume', 'Cotas', (el, c) => (c.scene?.rooms.room(el)?.area ?? 0) * (+el.upperOffset || 0), 'volume'),
    P('department', 'Departamento', 'Dados de Identificação', 'text'),
    P('floorFinish', 'Acabamento do Piso', 'Dados de Identificação', 'text'),
    P('wallFinish', 'Acabamento da Parede', 'Dados de Identificação', 'text'),
    P('ceilingFinish', 'Acabamento do Forro', 'Dados de Identificação', 'text'),
    P('occupant', 'Ocupante', 'Dados de Identificação', 'text'),
    comments,
  ],
  roomSeparator: [ro('length', 'Comprimento', 'Cotas', (el) => dist(el.a, el.b))],
  grid: [
    P('name', 'Nome', 'Dados de Identificação', 'text'),
    P('bubbles', 'Balões', 'Gráficos', 'select', {
      options: () => [
        { value: 'both', label: 'Ambas as pontas' },
        { value: 'start', label: 'Início' },
        { value: 'end', label: 'Fim' },
      ],
    }),
    ro('length', 'Comprimento', 'Cotas', (el) => dist(el.a, el.b)),
  ],
  level: [P('name', 'Nome', 'Dados de Identificação', 'text'), len('elevation', 'Cota', 'Restrições')],
  dimension: [P('override', 'Substituir Texto', 'Text', 'text'), ro('refs', 'Referências', 'Outros', (el) => String(el.refs?.length ?? 0), 'text')],
  text: [
    P('text', 'Texto', 'Texto', 'textarea'),
    P('size', 'Tamanho (mm no papel)', 'Text', 'select', { options: () => [1.8, 2.5, 3.5, 5, 7].map((v) => ({ value: v, label: `${v} mm` })) }),
    P('rotation', 'Rotação', 'Text', 'angle'),
    P('bold', 'Negrito', 'Text', 'bool'),
    P('align', 'Alinhamento', 'Text', 'select', {
      options: () => [
        { value: 'left', label: 'Esquerda' },
        { value: 'center', label: 'Centro' },
        { value: 'right', label: 'Direita' },
      ],
    }),
  ],
  tag: [P('leader', 'Linha de Chamada', 'Gráficos', 'bool'), ro('target', 'Etiquetas', 'Outros', (el, c) => describe(c.doc, c.doc.get(el.targetId)), 'text')],
  region: [
    P('pattern', 'Padrão de Preenchimento', 'Gráficos', 'select', {
      options: () => [{ value: 'diag', label: 'Diagonal' }, { value: 'cross', label: 'Hachura Cruzada' }, { value: 'concrete', label: 'Concreto' }, { value: 'insulation', label: 'Isolamento' }, { value: 'brick', label: 'Alvenaria' }, { value: 'wood', label: 'Madeira' }, { value: 'earth', label: 'Terra' }, { value: 'solid', label: 'Sólido' }, { value: 'none', label: 'Tom de cinza' }],
    }),
    P('outline', 'Mostrar Contorno', 'Gráficos', 'bool'),
    ro('area', 'Área', 'Cotas', (el) => polyArea(el.boundary || []), 'area'),
  ],
  detailLine: [
    P('style', 'Estilo de Linha', 'Gráficos', 'select', { options: () => [{ value: 'thin', label: 'Fina' }, { value: 'medium', label: 'Média' }, { value: 'wide', label: 'Grossa' }, { value: 'dashed', label: 'Tracejada' }, { value: 'hidden', label: 'Oculta' }, { value: 'center', label: 'Centro' }] }),
    ro('length', 'Comprimento', 'Cotas', (el) => dist(el.a, el.b)),
  ],
};

const DETAIL = [
  { value: 'coarse', label: 'Grosso' },
  { value: 'medium', label: 'Médio' },
  { value: 'fine', label: 'Fino' },
];

const STYLES = [
  { value: 'wireframe', label: 'Arame' },
  { value: 'hidden', label: 'Linha Oculta' },
  { value: 'shaded', label: 'Sombreado' },
  { value: 'consistent', label: 'Cores Consistentes' },
  { value: 'realistic', label: 'Realista' },
];

const viewName = P('name', 'Nome da Vista', 'Dados de Identificação', 'text');
const viewScale = P('scale', 'Escala da Vista', 'Gráficos', 'select', { options: (c) => scaleOptions(c.doc.units), get: (el) => el.scale, set: (el, v) => ({ scale: +v }) });
const viewDetail = P('detail', 'Nível de Detalhe', 'Gráficos', 'select', { options: () => DETAIL });
const vis = P('vis', 'Visibilidade/Gráficos', 'Gráficos', 'button', { action: 'visibility', text: 'Editar...' });

const VIEW = {
  plan: [
    viewScale,
    viewDetail,
    vis,
    P('roomFill', 'Preenchimento de Cor do Ambiente', 'Gráficos', 'bool'),
    P('underlay', 'Subjacente', 'Subjacente', 'select', {
      get: (el) => el.underlay || '',
      set: (el, v) => ({ underlay: v || null }),
      options: (c) => [{ value: '', label: 'Nenhum' }, { value: 'below', label: 'Pavimento abaixo' }, ...c.doc.levels().map((l) => ({ value: l.id, label: l.name }))],
    }), len('cutHeight', 'Altura do Plano de Corte', 'Extensões'), len('viewDepth', 'Deslocamento de Profundidade da Vista', 'Extensões'), ro('level', 'Pavimento Associado', 'Dados de Identificação', (el, c) => c.doc.get(el.levelId)?.name ?? '', 'text'), viewName],
  ceilingPlan: [viewScale, viewDetail, vis, len('cutHeight', 'Altura do Plano de Corte', 'Extensões'), ro('level', 'Pavimento Associado', 'Dados de Identificação', (el, c) => c.doc.get(el.levelId)?.name ?? '', 'text'), viewName],
  view3d: [
    P('style', 'Estilo Visual', 'Gráficos', 'select', { options: () => STYLES }),
    viewDetail,
    vis,
    P('sectionBoxOn', 'Caixa de Corte', 'Extensões', 'bool', { get: (el) => !!el.sectionBox, set: () => null, action: 'section-box' }),
    P('persp', 'Perspectiva', 'Câmera', 'bool', { get: (el, c) => c.app?.vc?.cam?.persp !== false, set: () => null, action: 'toggle-persp' }),
    viewName,
  ],
  elevation: [viewScale, P('style', 'Estilo Visual', 'Gráficos', 'select', { options: () => STYLES }), viewDetail, vis, len('depth', 'Deslocamento de Corte Distante', 'Extensões'), viewName],
  section: [viewScale, P('style', 'Estilo Visual', 'Gráficos', 'select', { options: () => STYLES }), viewDetail, vis, len('depth', 'Deslocamento de Corte Distante', 'Extensões'), viewName],
  schedule: [viewName, ro('category', 'Categoria', 'Outros', (el) => el.category, 'text'), P('fields', 'Campos', 'Outros', 'button', { action: 'schedule-fields', text: 'Editar...' })],
  sheet: [
    P('number', 'Número da Prancha', 'Dados de Identificação', 'text'),
    P('name', 'Nome da Prancha', 'Dados de Identificação', 'text'),
    P('drawnBy', 'Desenhado Por', 'Dados de Identificação', 'text'),
    P('checkedBy', 'Verificado Por', 'Dados de Identificação', 'text'),
    P('issueDate', 'Data de Emissão', 'Dados de Identificação', 'text'),
    P('size', 'Tamanho da Prancha', 'Gráficos', 'select', { options: () => SHEET_SIZES.map((s) => ({ value: s.id, label: s.label })) }),
  ],
};

export const SHEET_SIZES = [
  { id: 'A3', label: 'A3 (420 x 297 mm)', w: 420, h: 297 },
  { id: 'A2', label: 'A2 (594 x 420 mm)', w: 594, h: 420 },
  { id: 'A1', label: 'A1 (841 x 594 mm)', w: 841, h: 594 },
  { id: 'A0', label: 'A0 (1189 x 841 mm)', w: 1189, h: 841 },
  { id: 'ARCHC', label: 'ARCH C (24 x 18 in)', w: 609.6, h: 457.2 },
  { id: 'ARCHD', label: 'ARCH D (36 x 24 in)', w: 914.4, h: 609.6 },
  { id: 'ARCHE', label: 'ARCH E (48 x 36 in)', w: 1219.2, h: 914.4 },
  { id: 'TABLOID', label: 'Tabloid (17 x 11 in)', w: 431.8, h: 279.4 },
];

const MAT = (key, label) => P(key, label, 'Materiais e Acabamentos', 'material');

export const TYPE_PARAMS = {
  wallType: [
    P('function', 'Função', 'Construção', 'select', {
      options: () => [
        { value: 'exterior', label: 'Externo' },
        { value: 'interior', label: 'Interno' },
        { value: 'foundation', label: 'Fundação' },
      ],
    }),
    P('layers', 'Estrutura', 'Construção', 'button', { action: 'edit-layers', text: 'Editar...' }),
    ro('thick', 'Espessura', 'Construção', (t) => typeThickness(t)),
    P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text'),
    P('description', 'Descrição', 'Dados de Identificação', 'text'),
  ],
  floorType: [P('layers', 'Estrutura', 'Construção', 'button', { action: 'edit-layers', text: 'Editar...' }), ro('thick', 'Espessura', 'Construção', (t) => typeThickness(t)), P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text')],
  roofType: [P('layers', 'Estrutura', 'Construção', 'button', { action: 'edit-layers', text: 'Editar...' }), ro('thick', 'Espessura', 'Construção', (t) => typeThickness(t)), P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text')],
  ceilingType: [P('layers', 'Estrutura', 'Construção', 'button', { action: 'edit-layers', text: 'Editar...' }), len('pattern', 'Espaçamento da Grade (0 para nenhum)', 'Gráficos'), P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text')],
  doorType: [
    len('width', 'Largura', 'Cotas'),
    len('height', 'Altura', 'Cotas'),
    len('frameWidth', 'Largura do Marco', 'Cotas'),
    len('thickness', 'Espessura do Painel', 'Cotas'),
    P('glazing', 'Painel de Vidro', 'Construção', 'bool'),
    MAT('panelMaterialId', 'Material do Painel'),
    MAT('frameMaterialId', 'Material do Marco'),
    P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text'),
  ],
  windowType: [len('width', 'Largura', 'Cotas'), len('height', 'Altura', 'Cotas'), len('sill', 'Altura Padrão do Peitoril', 'Cotas'), len('frameWidth', 'Largura do Marco', 'Cotas'), len('frameDepth', 'Profundidade do Marco', 'Cotas'), MAT('frameMaterialId', 'Material do Marco'), P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text')],
  columnType: [
    P('shape', 'Forma', 'Construção', 'select', {
      options: () => [
        { value: 'rect', label: 'Retangular' },
        { value: 'round', label: 'Redondo' },
      ],
    }),
    len('width', 'Largura (b)', 'Cotas'),
    len('depth', 'Profundidade (h)', 'Cotas'),
    MAT('materialId', 'Material'),
    P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text'),
  ],
  beamType: [len('width', 'Largura', 'Cotas'), len('depth', 'Profundidade', 'Cotas'), MAT('materialId', 'Material'), P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text')],
  stairType: [len('maxRiser', 'Altura Máxima do Degrau', 'Cotas'), len('tread', 'Profundidade Mínima do Piso', 'Cotas'), len('width', 'Largura Padrão', 'Cotas'), len('thickness', 'Espessura', 'Construção'), P('monolithic', 'Monolítico', 'Construção', 'bool'), MAT('materialId', 'Material')],
  railingType: [len('height', 'Altura do Guarda-corpo', 'Cotas'), len('spacing', 'Espaçamento dos Balusters', 'Cotas'), len('rail', 'Tamanho do Corrimão', 'Cotas'), P('glass', 'Painéis de Vidro', 'Construção', 'bool'), MAT('materialId', 'Material')],
  componentType: [len('width', 'Largura', 'Cotas'), len('depth', 'Profundidade', 'Cotas'), len('height', 'Altura', 'Cotas'), len('elevation', 'Cota Padrão', 'Cotas'), ro('category', 'Categoria', 'Dados de Identificação', (t) => t.category, 'text'), P('mark', 'Marca do Tipo', 'Dados de Identificação', 'text')],
};

export function instanceParams(el) {
  if (VIEW[el.kind]) return VIEW[el.kind];
  return INSTANCE[el.kind] || [mark, comments];
}

export function paramValue(d, el, ctx) {
  if (d.get) return d.get(el, ctx);
  return el[d.key];
}

/** Patch for setting a parameter (null means the descriptor handles it with an action). */
export function paramPatch(d, el, value, ctx) {
  if (d.set) return d.set(el, value, ctx);
  if (d.type === 'number') return { [d.key]: +value };
  if (d.type === 'select' && typeof paramValue(d, el, ctx) === 'number') return { [d.key]: +value };
  return { [d.key]: value };
}

export function isReadOnly(d, el, ctx) {
  return d.type === 'readonly' || (typeof d.ro === 'function' && d.ro(el, ctx));
}

function wallHeight(el, c) {
  const { base, top } = verticalExtent(c.doc, el);
  return top - base;
}

function slabArea(el) {
  const outer = polyArea(el.boundary || []);
  return outer - (el.holes || []).reduce((s, h) => s + polyArea(h), 0);
}

function pathLength(p) {
  let s = 0;
  for (let i = 0; i + 1 < p.length; i++) s += dist(p[i], p[i + 1]);
  return s;
}

export function describe(doc, el) {
  if (!el) return '';
  if (el.kind === 'room') return `Ambiente ${el.number || ''} ${el.name || ''}`.trim();
  if (el.kind === 'level' || el.kind === 'grid') return `${KIND_LABEL[el.kind]} ${el.name}`;
  const t = doc.get(el.typeId);
  const base = KIND_LABEL[el.kind] || el.kind;
  return t ? `${base}: ${t.name}` : base;
}
