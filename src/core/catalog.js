/**
 * Built-in content: categories, materials, element types and project
 * templates. Every value here is original. Sizes are millimetres; imperial
 * projects get types sized and named in nominal inches.
 *
 * Element shapes (all lengths in mm, points are [x, y] in plan):
 *   level        { name, elevation }
 *   grid         { name, a, b }
 *   wall         { typeId, levelId, a, b, baseOffset, topLevelId, topOffset, height,
 *                  locationLine: 'center'|'exterior'|'interior', flipped, roomBounding,
 *                  joinA, joinB, mark, comments }
 *   door         { typeId, hostId, t, flipFacing, flipHand, mark }
 *   window       { typeId, hostId, t, sill, flipFacing, mark }
 *   opening      { hostId, t, width, height, sill }
 *   floor        { typeId, levelId, boundary, holes, offset }
 *   ceiling      { typeId, levelId, boundary, holes, offset }
 *   roof         { typeId, levelId, boundary, slopes, baseOffset }
 *   column       { typeId, levelId, at, rotation, baseOffset, topLevelId, topOffset, height }
 *   beam         { typeId, levelId, a, b, offset }
 *   stair        { typeId, levelId, topLevelId, baseOffset, topOffset, a, b, width }
 *   ramp         { levelId, topLevelId, baseOffset, topOffset, height, a, b, width, thickness }
 *   topography   { levelId, points: [x,y,z][], boundary, holes, contours, modifiers, baseElevation }
 *   railing      { typeId, levelId, path, offset }
 *   component    { typeId, levelId, at, rotation, offset }
 *   room         { levelId, at, name, number, upperOffset, tagAt }
 *   roomSeparator{ levelId, a, b }
 *   dimension    { viewId, refs: [{ at, id, ref }], dir, line }
 *   text         { viewId, at, text, size, rotation }
 *   tag          { viewId, targetId, at, leader }
 *   detailLine   { viewId, a, b, style }
 */
import { MM_PER_FOOT, MM_PER_INCH } from './units.js';

const IN = MM_PER_INCH;
const FT = MM_PER_FOOT;

// Categories -------------------------------------------------------------------

/** Visibility categories. `model` categories appear in 3D. */
export const CATEGORIES = [
  { id: 'walls', label: 'Paredes', model: true },
  { id: 'doors', label: 'Portas', model: true },
  { id: 'windows', label: 'Janelas', model: true },
  { id: 'floors', label: 'Pisos', model: true },
  { id: 'ceilings', label: 'Forros', model: true },
  { id: 'roofs', label: 'Coberturas', model: true },
  { id: 'columns', label: 'Pilares', model: true },
  { id: 'beams', label: 'Estrutura (Vigas)', model: true },
  { id: 'stairs', label: 'Escadas', model: true },
  { id: 'ramps', label: 'Rampas', model: true },
  { id: 'topography', label: 'Topografia', model: true },
  { id: 'railings', label: 'Guarda-corpos', model: true },
  { id: 'furniture', label: 'Móveis', model: true },
  { id: 'casework', label: 'Marcenaria', model: true },
  { id: 'plumbing', label: 'Louças Sanitárias', model: true },
  { id: 'equipment', label: 'Eletrodomésticos', model: true },
  { id: 'planting', label: 'Vegetação', model: true },
  { id: 'lighting', label: 'Luminárias', model: true },
  { id: 'rooms', label: 'Ambientes', model: false },
  { id: 'roomSeparators', label: 'Linhas de Separação de Ambientes', model: false },
  { id: 'grids', label: 'Eixos', model: false },
  { id: 'levels', label: 'Pavimentos', model: false },
  { id: 'dimensions', label: 'Cotas', model: false },
  { id: 'text', label: 'Notas de Texto', model: false },
  { id: 'tags', label: 'Etiquetas', model: false },
  { id: 'lines', label: 'Linhas de Detalhe', model: false },
  { id: 'markers', label: 'Marcadores de Vista', model: false },
];

const KIND_CATEGORY = {
  wall: 'walls',
  door: 'doors',
  window: 'windows',
  opening: 'walls',
  floor: 'floors',
  ceiling: 'ceilings',
  roof: 'roofs',
  column: 'columns',
  beam: 'beams',
  stair: 'stairs',
  ramp: 'ramps',
  topography: 'topography',
  railing: 'railings',
  room: 'rooms',
  roomSeparator: 'roomSeparators',
  grid: 'grids',
  level: 'levels',
  dimension: 'dimensions',
  text: 'text',
  tag: 'tags',
  detailLine: 'lines',
  region: 'lines',
};

/** Category of an element (components take theirs from the type). */
export function categoryOf(el, doc) {
  if (el.kind === 'component') return doc?.get(el.typeId)?.category || 'furniture';
  return KIND_CATEGORY[el.kind] || null;
}

/** Human names for element kinds (singular). */
export const KIND_LABEL = {
  wall: 'Parede',
  door: 'Porta',
  window: 'Janela',
  opening: 'Abertura em Parede',
  floor: 'Piso',
  ceiling: 'Forro',
  roof: 'Cobertura',
  column: 'Pilar',
  beam: 'Viga',
  stair: 'Escada',
  ramp: 'Rampa',
  topography: 'Terreno',
  railing: 'Guarda-corpo',
  component: 'Componente',
  room: 'Ambiente',
  roomSeparator: 'Separador de Ambientes',
  grid: 'Eixo',
  level: 'Pavimento',
  dimension: 'Cota',
  text: 'Nota de Texto',
  tag: 'Etiqueta',
  detailLine: 'Linha de Detalhe',
  region: 'Região Preenchida',
};

export const TYPE_KIND = {
  wall: 'wallType',
  door: 'doorType',
  window: 'windowType',
  floor: 'floorType',
  ceiling: 'ceilingType',
  roof: 'roofType',
  column: 'columnType',
  beam: 'beamType',
  stair: 'stairType',
  railing: 'railingType',
  component: 'componentType',
};

// Materials ----------------------------------------------------------------------

const MATERIALS = [
  ['mat-default', 'Padrão', '#c8c8c8', 'none'],
  ['mat-concrete', 'Concreto, Moldado no Local', '#b9b6ae', 'concrete'],
  ['mat-masonry-brick', 'Alvenaria, Tijolo', '#a5553f', 'brick'],
  ['mat-cmu', 'Alvenaria, Bloco de Concreto', '#a9a69e', 'diag'],
  ['mat-gypsum', 'Placa de Gesso', '#f1efe9', 'none'],
  ['mat-stud', 'Montante Metálico', '#d6d3cc', 'none'],
  ['mat-wood-frame', 'Madeira, Estrutura', '#cfa978', 'wood'],
  ['mat-insulation', 'Isolamento, Manta', '#f2dc8a', 'insulation'],
  ['mat-sheathing', 'Compensado, Revestimento', '#c79a63', 'diag'],
  ['mat-air', 'Espaço de Ar', '#e9eef2', 'none'],
  ['mat-membrane', 'Barreira de Ar', '#5d6672', 'none'],
  ['mat-plaster', 'Reboco, Exterior', '#e6e0d3', 'none'],
  ['mat-siding', 'Revestimento, Madeira Pintada', '#e9e6df', 'none'],
  ['mat-wood', 'Madeira, Carvalho', '#b98b57', 'wood'],
  ['mat-wood-light', 'Madeira, Bétula', '#dcc09a', 'wood'],
  ['mat-steel', 'Aço', '#8d949c', 'solid'],
  ['mat-aluminum', 'Alumínio, Anodizado', '#a7adb4', 'solid'],
  ['mat-glass', 'Vidro', '#9cc7dd', 'none', 0.65],
  ['mat-roofing', 'Cobertura, Telha Asfáltica', '#5b5e63', 'none'],
  ['mat-roof-metal', 'Cobertura, Telha Metálica', '#6f7880', 'none'],
  ['mat-tile', 'Cerâmica, Porcelanato', '#e8e4dc', 'none'],
  ['mat-carpet', ' carpete', '#8f8a80', 'none'],
  ['mat-timber-floor', 'Madeira, Piso', '#c49a6c', 'none'],
  ['mat-acoustic', 'Forro Acústico', '#f4f3ef', 'none'],
  ['mat-paint-white', 'Tinta, Branca', '#f5f4f0', 'none'],
  ['mat-door', 'Folha de Porta, Pintada', '#ece9e2', 'none'],
  ['mat-fabric', 'Tecido, Estofado', '#6f7f8e', 'none'],
  ['mat-fabric-warm', 'Tecido, Linho', '#d9cfbf', 'none'],
  ['mat-porcelain', 'Porcelana, Branca', '#fbfbf8', 'none'],
  ['mat-stone', 'Pedra, Bancada', '#9a9690', 'none'],
  ['mat-foliage', 'Folhagem', '#5f8f4e', 'none'],
  ['mat-earth', 'Terra', '#8a7356', 'earth'],
];

export function defaultMaterials() {
  return MATERIALS.map(([id, name, color, cut, opacity]) => ({ id, kind: 'material', name, color, cut, opacity: opacity ?? 1 }));
}

// Types --------------------------------------------------------------------------

const L = (materialId, thickness, fn = 'structure') => ({ materialId, thickness, function: fn });

function wallTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  return [
    {
      id: 'wt-generic',
      name: imp ? 'Genérica - 8"' : 'Genérica - 200 mm',
      function: 'exterior',
      layers: [L('mat-default', t(200, 8))],
    },
    {
      id: 'wt-ext-brick-stud',
      name: imp ? 'Externa - Tijolo sobre Montante de Madeira' : 'Externa - Tijolo sobre Estrutura de Madeira',
      function: 'exterior',
      layers: [
        L('mat-masonry-brick', t(90, 3.625), 'finish'),
        L('mat-air', t(25, 1), 'air'),
        L('mat-sheathing', t(12, 0.5), 'substrate'),
        L('mat-wood-frame', t(140, 5.5), 'structure'),
        L('mat-gypsum', t(13, 0.5), 'finish'),
      ],
    },
    {
      id: 'wt-ext-siding',
      name: imp ? 'Externa - Revestimento sobre Montante de Madeira' : 'Externa - Revestimento sobre Estrutura de Madeira',
      function: 'exterior',
      layers: [L('mat-siding', t(19, 0.75), 'finish'), L('mat-sheathing', t(12, 0.5), 'substrate'), L('mat-wood-frame', t(140, 5.5), 'structure'), L('mat-gypsum', t(13, 0.5), 'finish')],
    },
    {
      id: 'wt-ext-concrete',
      name: imp ? 'Externa - Concreto 10"' : 'Externa - Concreto 250 mm',
      function: 'exterior',
      layers: [L('mat-plaster', t(20, 0.75), 'finish'), L('mat-concrete', t(250, 10), 'structure'), L('mat-gypsum', t(13, 0.5), 'finish')],
    },
    {
      id: 'wt-ext-cmu',
      name: imp ? 'Externa - Bloco 8", Isolado' : 'Externa - Bloco 200 mm, Isolado',
      function: 'exterior',
      layers: [L('mat-plaster', t(20, 0.75), 'finish'), L('mat-cmu', t(190, 7.625), 'structure'), L('mat-insulation', t(50, 2), 'insulation'), L('mat-gypsum', t(13, 0.5), 'finish')],
    },
    {
      id: 'wt-int-partition',
      name: imp ? 'Interna - Parede 4 7/8"' : 'Interna - Parede 125 mm',
      function: 'interior',
      layers: [L('mat-gypsum', t(13, 0.625), 'finish'), L('mat-stud', t(92, 3.625), 'structure'), L('mat-gypsum', t(13, 0.625), 'finish')],
    },
    {
      id: 'wt-int-partition-wide',
      name: imp ? 'Interna - Parede 6 7/8"' : 'Interna - Parede 175 mm',
      function: 'interior',
      layers: [L('mat-gypsum', t(13, 0.625), 'finish'), L('mat-stud', t(146, 5.625), 'structure'), L('mat-gypsum', t(13, 0.625), 'finish')],
    },
    {
      id: 'wt-int-cmu',
      name: imp ? 'Interna - Alvenaria 6"' : 'Interna - Bloco 150 mm',
      function: 'interior',
      layers: [L('mat-cmu', t(150, 6), 'structure')],
    },
    {
      id: 'wt-retaining',
      name: imp ? 'Fundação - Concreto 12"' : 'Fundação - Concreto 300 mm',
      function: 'foundation',
      layers: [L('mat-concrete', t(300, 12), 'structure')],
    },
    {
      id: 'wt-curtain',
      name: 'Parede Cortina - Fachada envidraçada',
      function: 'exterior',
      layers: [L('mat-glass', t(60, 2.5), 'structure')],
      curtain: { hSpacing: imp ? 5 * FT : 1500, vSpacing: imp ? 4 * FT : 1200, mullionWidth: t(50, 2), mullionDepth: t(150, 6), materialId: 'mat-aluminum' },
    },
  ].map((x) => ({ ...x, kind: 'wallType' }));
}

function floorTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  return [
    { id: 'ft-generic', name: imp ? 'Genérico - 12"' : 'Genérico - 300 mm', layers: [L('mat-default', t(300, 12))] },
    { id: 'ft-concrete', name: imp ? 'Concreto - Laje 6", Cerâmica' : 'Concreto - Laje 150 mm, Cerâmica', layers: [L('mat-tile', t(15, 0.5), 'finish'), L('mat-concrete', t(150, 6), 'structure')] },
    {
      id: 'ft-wood',
      name: imp ? 'Vigamento de Madeira - 10" com Piso' : 'Vigamento de Madeira - 250 mm com Piso',
      layers: [L('mat-timber-floor', t(20, 0.75), 'finish'), L('mat-sheathing', t(18, 0.75), 'substrate'), L('mat-wood-frame', t(235, 9.25), 'structure')],
    },
    { id: 'ft-slab-grade', name: imp ? 'Laje sobre Terreno - 4"' : 'Laje sobre Terreno - 100 mm', layers: [L('mat-concrete', t(100, 4), 'structure')] },
  ].map((x) => ({ ...x, kind: 'floorType' }));
}

function roofTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  return [
    { id: 'rt-generic', name: imp ? 'Genérica - 12"' : 'Genérica - 300 mm', layers: [L('mat-roofing', t(300, 12))] },
    {
      id: 'rt-shingle',
      name: imp ? 'Terça de Madeira - Telha Asfáltica' : 'Terça de Madeira - Telha Asfáltica',
      layers: [L('mat-roofing', t(10, 0.375), 'finish'), L('mat-sheathing', t(18, 0.75), 'substrate'), L('mat-wood-frame', t(235, 9.25), 'structure')],
    },
    { id: 'rt-metal', name: 'Telha Metálica Engatilhada', layers: [L('mat-roof-metal', t(40, 1.5), 'finish'), L('mat-insulation', t(150, 6), 'insulation'), L('mat-steel', t(10, 0.375), 'structure')] },
    { id: 'rt-concrete', name: imp ? 'Concreto - Cobertura Plana 8"' : 'Concreto - Cobertura Plana 200 mm', layers: [L('mat-membrane', t(10, 0.375), 'membrane'), L('mat-insulation', t(100, 4), 'insulation'), L('mat-concrete', t(200, 8), 'structure')] },
  ].map((x) => ({ ...x, kind: 'roofType' }));
}

function ceilingTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  return [
    { id: 'ct-gypsum', name: imp ? 'Placa de Gesso - 5/8"' : 'Placa de Gesso - 13 mm', layers: [L('mat-gypsum', t(13, 0.625), 'finish')], pattern: 'none' },
    { id: 'ct-acoustic', name: imp ? 'Forro Acústico - 2\' x 2\'' : 'Forro Acústico - 600 x 600', layers: [L('mat-acoustic', t(20, 0.75), 'finish')], pattern: imp ? 2 * FT : 600 },
  ].map((x) => ({ ...x, kind: 'ceilingType' }));
}

function doorTypes(imp) {
  const d = (family, mmW, mmH, inW, inH, extra = {}) => {
    const width = imp ? inW * IN : mmW;
    const height = imp ? inH * IN : mmH;
    const size = imp ? `${inW}" x ${inH}"` : `${mmW} x ${mmH} mm`;
    return { family, width, height, size, frameWidth: imp ? 2 * IN : 50, frameDepth: imp ? 5 * IN : 125, thickness: imp ? 1.75 * IN : 44, panelMaterialId: 'mat-door', frameMaterialId: 'mat-wood-light', ...extra };
  };
  const list = [
    ['dt-single-36', 'Folha Simples Lisa', d('single', 915, 2134, 36, 84)],
    ['dt-single-32', 'Folha Simples Lisa', d('single', 813, 2134, 32, 84)],
    ['dt-single-30', 'Folha Simples Lisa', d('single', 762, 2134, 30, 84)],
    ['dt-single-glass', 'Folha Simples Envidraçada', d('single', 915, 2134, 36, 84, { glazing: true })],
    ['dt-double-72', 'Folha Dupla Lisa', d('double', 1830, 2134, 72, 84)],
    ['dt-double-glass', 'Folha Dupla Envidraçada', d('double', 1830, 2134, 72, 84, { glazing: true })],
    ['dt-sliding-72', 'Correr Envidraçada', d('sliding', 1830, 2134, 72, 84, { glazing: true, frameMaterialId: 'mat-aluminum' })],
    ['dt-bifold-48', 'Sanfona', d('bifold', 1220, 2032, 48, 80)],
    ['dt-pocket-32', 'De Correr (Embutida)', d('pocket', 813, 2032, 32, 80)],
    ['dt-overhead-96', 'Seccionada de Sobrepor', d('overhead', 2440, 2134, 96, 84, { frameMaterialId: 'mat-aluminum' })],
    ['dt-opening-36', 'Vão com Batente', d('opening', 915, 2134, 36, 84)],
  ];
  return list.map(([id, family, x]) => ({ id, kind: 'doorType', familyName: family, name: x.size, ...x }));
}

function windowTypes(imp) {
  const w = (family, mmW, mmH, inW, inH, extra = {}) => ({
    family,
    width: imp ? inW * IN : mmW,
    height: imp ? inH * IN : mmH,
    sill: imp ? 36 * IN : 900,
    size: imp ? `${inW}" x ${inH}"` : `${mmW} x ${mmH} mm`,
    frameWidth: imp ? 2.5 * IN : 60,
    frameDepth: imp ? 4 * IN : 100,
    frameMaterialId: 'mat-paint-white',
    ...extra,
  });
  const list = [
    ['wnt-fixed-36x48', 'Fixa', w('fixed', 900, 1200, 36, 48)],
    ['wnt-fixed-72x48', 'Fixa', w('fixed', 1800, 1200, 72, 48)],
    ['wnt-casement-24x48', 'Maxim-ar', w('casement', 600, 1200, 24, 48)],
    ['wnt-casement-36x60', 'Maxim-ar', w('casement', 900, 1500, 36, 60)],
    ['wnt-dh-36x60', 'Guilhotina', w('doubleHung', 900, 1500, 36, 60)],
    ['wnt-sliding-48x48', 'Correr', w('sliding', 1200, 1200, 48, 48)],
    ['wnt-awning-36x24', 'Basculante', w('awning', 900, 600, 36, 24, { sill: imp ? 60 * IN : 1500 })],
    ['wnt-picture-96x72', 'Panorâmica', w('fixed', 2400, 1800, 96, 72, { sill: imp ? 18 * IN : 450 })],
  ];
  return list.map(([id, familyName, x]) => ({ id, kind: 'windowType', familyName, name: x.size, ...x }));
}

function columnTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  return [
    { id: 'colt-rect-18', name: imp ? 'Retangular - 18" x 18"' : 'Retangular - 450 x 450 mm', shape: 'rect', width: t(450, 18), depth: t(450, 18), materialId: 'mat-concrete' },
    { id: 'colt-rect-12x24', name: imp ? 'Retangular - 12" x 24"' : 'Retangular - 300 x 600 mm', shape: 'rect', width: t(300, 12), depth: t(600, 24), materialId: 'mat-concrete' },
    { id: 'colt-round-18', name: imp ? 'Circular - 18" de Diâmetro' : 'Circular - 450 mm de Diâmetro', shape: 'round', width: t(450, 18), depth: t(450, 18), materialId: 'mat-concrete' },
    { id: 'colt-steel-hss', name: imp ? 'Tubo de Aço - 8" x 8"' : 'Tubo de Aço - 200 x 200 mm', shape: 'rect', width: t(200, 8), depth: t(200, 8), materialId: 'mat-steel' },
  ].map((x) => ({ ...x, kind: 'columnType', familyName: x.shape === 'round' ? 'Pilar Circular' : 'Pilar Retangular' }));
}

function beamTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  return [
    { id: 'bt-concrete', name: imp ? 'Concreto - 12" x 24"' : 'Concreto - 300 x 600 mm', width: t(300, 12), depth: t(600, 24), materialId: 'mat-concrete' },
    { id: 'bt-steel', name: imp ? 'Aço - 8" x 16"' : 'Aço - 200 x 400 mm', width: t(200, 8), depth: t(400, 16), materialId: 'mat-steel' },
    { id: 'bt-timber', name: imp ? 'Madeira Laminada - 5 1/2" x 18"' : 'Madeira Laminada - 140 x 450 mm', width: t(140, 5.5), depth: t(450, 18), materialId: 'mat-wood' },
  ].map((x) => ({ ...x, kind: 'beamType', familyName: 'Viga' }));
}

function stairTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  return [
    { id: 'st-concrete', name: 'Concreto Monolítico', maxRiser: t(180, 7), tread: t(280, 11), width: t(1100, 44), thickness: t(150, 6), materialId: 'mat-concrete', monolithic: true },
    { id: 'st-wood', name: 'Degraus de Madeira', maxRiser: t(180, 7.5), tread: t(260, 10), width: t(1000, 36), thickness: t(40, 1.5), materialId: 'mat-wood', monolithic: false },
  ].map((x) => ({ ...x, kind: 'stairType', familyName: 'Escada' }));
}

function railingTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  return [
    { id: 'rlt-handrail', name: imp ? 'Corrimão - 42"' : 'Corrimão - 1100 mm', height: t(1100, 42), spacing: t(110, 4), rail: t(50, 2), baluster: t(20, 0.75), materialId: 'mat-steel', glass: false },
    { id: 'rlt-glass', name: imp ? 'Painel de Vidro - 42"' : 'Painel de Vidro - 1100 mm', height: t(1100, 42), spacing: t(1200, 48), rail: t(50, 2), baluster: t(50, 2), materialId: 'mat-aluminum', glass: true },
  ].map((x) => ({ ...x, kind: 'railingType', familyName: 'Guarda-corpo' }));
}

/**
 * Component families. `family` selects the procedural geometry (families.js);
 * sizes are overall width (x), depth (y) and height (z).
 */
function componentTypes(imp) {
  const t = (mm, inch) => (imp ? inch * IN : mm);
  const c = (id, family, category, familyName, name, w, d, h, extra = {}) => ({ id, kind: 'componentType', family, category, familyName, name, width: w, depth: d, height: h, ...extra });
  return [
    c('cpt-bed-queen', 'bed', 'furniture', 'Cama', imp ? 'Queen 60" x 80"' : 'Cama de Casal 1600 x 2000 mm', t(1600, 60), t(2050, 82), t(550, 22)),
    c('cpt-bed-single', 'bed', 'furniture', 'Cama', imp ? 'Solteiro 39" x 75"' : 'Cama de Solteiro 900 x 2000 mm', t(950, 39), t(2050, 77), t(550, 22)),
    c('cpt-nightstand', 'cabinet', 'furniture', 'Criado-mudo', imp ? '20" x 16"' : '500 x 400 mm', t(500, 20), t(400, 16), t(550, 22)),
    c('cpt-sofa', 'sofa', 'furniture', 'Sofá', imp ? '84" Três Lugares' : 'Três Lugares 2100 mm', t(2100, 84), t(900, 36), t(800, 32)),
    c('cpt-armchair', 'armchair', 'furniture', 'Poltrona', imp ? '33"' : '850 mm', t(850, 33), t(850, 33), t(800, 32)),
    c('cpt-table-dining', 'table', 'furniture', 'Mesa de Jantar', imp ? '72" x 36"' : '1800 x 900 mm', t(1800, 72), t(900, 36), t(750, 30)),
    c('cpt-table-round', 'roundTable', 'furniture', 'Mesa Redonda', imp ? '48" de Diâmetro' : '1200 mm de Diâmetro', t(1200, 48), t(1200, 48), t(750, 30)),
    c('cpt-coffee', 'table', 'furniture', 'Mesa de Centro', imp ? '48" x 24"' : '1200 x 600 mm', t(1200, 48), t(600, 24), t(420, 17)),
    c('cpt-chair', 'chair', 'furniture', 'Cadeira', imp ? '18" x 20"' : '450 x 500 mm', t(450, 18), t(520, 20), t(850, 34)),
    c('cpt-desk', 'desk', 'furniture', 'Escrivaninha', imp ? '60" x 30"' : '1500 x 750 mm', t(1500, 60), t(750, 30), t(750, 30)),
    c('cpt-office-chair', 'chair', 'furniture', 'Cadeira de Escritório', imp ? '26"' : '650 mm', t(650, 26), t(650, 26), t(1000, 40)),
    c('cpt-bookshelf', 'shelf', 'furniture', 'Estante de Livros', imp ? '36" x 14"' : '900 x 350 mm', t(900, 36), t(350, 14), t(1800, 72)),
    c('cpt-wardrobe', 'cabinet', 'furniture', 'Guarda-roupa', imp ? '48" x 24"' : '1200 x 600 mm', t(1200, 48), t(600, 24), t(2100, 84)),
    c('cpt-base-cabinet', 'counter', 'casework', 'Gabinete Inferior', imp ? '36" x 24"' : '900 x 600 mm', t(900, 36), t(600, 24), t(900, 36)),
    c('cpt-counter-run', 'counter', 'casework', 'Bancada Contínua', imp ? '96" x 24"' : '2400 x 600 mm', t(2400, 96), t(600, 24), t(900, 36)),
    c('cpt-upper-cabinet', 'upperCabinet', 'casework', 'Gabinete Superior', imp ? '36" x 12"' : '900 x 350 mm', t(900, 36), t(350, 12), t(750, 30), { elevation: t(1400, 54) }),
    c('cpt-fridge', 'fridge', 'equipment', 'Geladeira', imp ? '36"' : '900 mm', t(900, 36), t(750, 30), t(1800, 70)),
    c('cpt-range', 'range', 'equipment', 'Fogão', imp ? '30"' : '760 mm', t(760, 30), t(650, 26), t(900, 36)),
    c('cpt-dishwasher', 'counter', 'equipment', 'Lava-louças', imp ? '24"' : '600 mm', t(600, 24), t(600, 24), t(850, 34)),
    c('cpt-washer', 'washer', 'equipment', 'Máquina de Lavar', imp ? '27"' : '600 mm', t(680, 27), t(700, 28), t(950, 38)),
    c('cpt-toilet', 'toilet', 'plumbing', 'Vaso Sanitário', 'Com Caixa Acoplada', t(380, 15), t(700, 28), t(780, 31)),
    c('cpt-sink-vanity', 'vanity', 'plumbing', 'Pia de Banheiro', imp ? '36" x 22"' : '900 x 550 mm', t(900, 36), t(550, 22), t(850, 34)),
    c('cpt-sink-kitchen', 'kitchenSink', 'plumbing', 'Pia de Cozinha', imp ? '33" Cuba Dupla' : '800 mm Cuba Dupla', t(800, 33), t(500, 22), t(200, 8), { elevation: t(700, 28) }),
    c('cpt-bathtub', 'bathtub', 'plumbing', 'Banheira', imp ? '60" x 30"' : '1700 x 750 mm', t(1700, 60), t(750, 30), t(550, 22)),
    c('cpt-shower', 'shower', 'plumbing', 'Chuveiro', imp ? '36" x 36"' : '900 x 900 mm', t(900, 36), t(900, 36), t(2000, 80)),
    c('cpt-tree', 'tree', 'planting', 'Árvore', imp ? 'Caduca 20\'' : 'Caduca 6 m', t(4000, 160), t(4000, 160), t(6000, 240)),
    c('cpt-shrub', 'shrub', 'planting', 'Arbusto', imp ? '36"' : '900 mm', t(900, 36), t(900, 36), t(900, 36)),
    c('cpt-pendant', 'pendant', 'lighting', 'Luminária de Teto', imp ? '16"' : '400 mm', t(400, 16), t(400, 16), t(300, 12), { elevation: t(2100, 84) }),
    c('cpt-floor-lamp', 'floorLamp', 'lighting', 'Luminária de Chão', imp ? '18"' : '450 mm', t(450, 18), t(450, 18), t(1600, 64)),
  ];
}

export function defaultTypes(system = 'metric') {
  const imp = system === 'imperial';
  return [
    ...wallTypes(imp),
    ...floorTypes(imp),
    ...roofTypes(imp),
    ...ceilingTypes(imp),
    ...doorTypes(imp),
    ...windowTypes(imp),
    ...columnTypes(imp),
    ...beamTypes(imp),
    ...stairTypes(imp),
    ...railingTypes(imp),
    ...componentTypes(imp),
  ];
}

/** Total thickness of a layered type. */
export function typeThickness(type) {
  if (!type?.layers) return 0;
  let s = 0;
  for (const l of type.layers) s += +l.thickness || 0;
  return s;
}

/** Default type for new elements of a kind (first one, or the remembered one). */
export function defaultTypeFor(doc, kind, preferred) {
  const tk = TYPE_KIND[kind];
  if (!tk) return null;
  if (preferred && doc.get(preferred)?.kind === tk) return doc.get(preferred);
  return doc.all(tk)[0] ?? null;
}

/** Display name "Family: Type" for a type. */
export function typeLabel(t) {
  if (!t) return '';
  const fam = t.familyName || FAMILY_BY_KIND[t.kind] || '';
  return fam ? `${fam}: ${t.name}` : t.name;
}

export const FAMILY_BY_KIND = {
  wallType: 'Parede',
  floorType: 'Piso',
  roofType: 'Cobertura',
  ceilingType: 'Forro',
};
