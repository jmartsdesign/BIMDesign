/**
 * Schedules: tables of elements of one category with chosen fields,
 * sorting, optional grouping by type with counts and totals, and CSV export.
 */
import { openingSize, verticalExtent, levelOf, stairLayout } from './model.js';
import { typeThickness, KIND_LABEL, CATEGORIES } from './catalog.js';
import { area as polyArea, perimeter, dist } from './geom.js';
import { formatLength, formatArea, formatVolume } from './units.js';
import { terrainBoundary } from './topography.js';

const typeName = (el, c) => c.doc.get(el.typeId)?.name ?? '';
const famName = (el, c) => c.doc.get(el.typeId)?.familyName ?? KIND_LABEL[el.kind] ?? '';
const lvlName = (el, c) => levelOf(c.doc, el)?.name ?? '';
const wallH = (el, c) => {
  const { base, top } = verticalExtent(c.doc, el);
  return top - base;
};
const slabArea = (el) => polyArea(el.boundary || []) - (el.holes || []).reduce((s, h) => s + polyArea(h), 0);

const F = (id, label, get, type = 'text', edit = null) => ({ id, label, get, type, edit });
const COUNT = F('count', 'Quantidade', () => 1, 'count');

export const SCHEDULE_CATEGORIES = {
  door: {
    label: 'Portas',
    kinds: ['door'],
    fields: [
      F('mark', 'Marca', (el) => el.mark ?? '', 'text', 'mark'),
      F('family', 'Família', famName),
      F('type', 'Tipo', typeName),
      F('width', 'Largura', (el, c) => openingSize(c.doc, el).width, 'length'),
      F('height', 'Altura', (el, c) => openingSize(c.doc, el).height, 'length'),
      F('level', 'Pavimento', lvlName),
      F('host', 'Tipo de Parede', (el, c) => c.doc.get(c.doc.get(el.hostId)?.typeId)?.name ?? ''),
      F('comments', 'Comentários', (el) => el.comments ?? '', 'text', 'comments'),
      COUNT,
    ],
    defaults: ['mark', 'family', 'type', 'width', 'height', 'level', 'comments'],
  },
  window: {
    label: 'Janelas',
    kinds: ['window'],
    fields: [
      F('mark', 'Marca', (el) => el.mark ?? '', 'text', 'mark'),
      F('family', 'Família', famName),
      F('type', 'Tipo', typeName),
      F('width', 'Largura', (el, c) => openingSize(c.doc, el).width, 'length'),
      F('height', 'Altura', (el, c) => openingSize(c.doc, el).height, 'length'),
      F('sill', 'Altura do Peitoril', (el, c) => openingSize(c.doc, el).sill, 'length'),
      F('level', 'Pavimento', lvlName),
      F('comments', 'Comentários', (el) => el.comments ?? '', 'text', 'comments'),
      COUNT,
    ],
    defaults: ['mark', 'family', 'type', 'width', 'height', 'sill', 'level'],
  },
  room: {
    label: 'Ambientes',
    kinds: ['room'],
    fields: [
      F('number', 'Número', (el) => el.number ?? '', 'text', 'number'),
      F('name', 'Nome', (el) => el.name ?? '', 'text', 'name'),
      F('level', 'Pavimento', lvlName),
      F('area', 'Área', (el, c) => c.scene.rooms.room(el)?.area ?? 0, 'area'),
      F('perimeter', 'Perímetro', (el, c) => c.scene.rooms.room(el)?.perimeter ?? 0, 'length'),
      F('volume', 'Volume', (el, c) => (c.scene.rooms.room(el)?.area ?? 0) * (+el.upperOffset || 0), 'volume'),
      F('department', 'Departamento', (el) => el.department ?? '', 'text', 'department'),
      F('floorFinish', 'Acabamento do Piso', (el) => el.floorFinish ?? '', 'text', 'floorFinish'),
      F('wallFinish', 'Acabamento da Parede', (el) => el.wallFinish ?? '', 'text', 'wallFinish'),
      F('ceilingFinish', 'Acabamento do Forro', (el) => el.ceilingFinish ?? '', 'text', 'ceilingFinish'),
      F('comments', 'Comentários', (el) => el.comments ?? '', 'text', 'comments'),
      COUNT,
    ],
    defaults: ['number', 'name', 'level', 'area', 'perimeter', 'floorFinish'],
  },
  wall: {
    label: 'Paredes',
    kinds: ['wall'],
    fields: [
      F('type', 'Tipo', typeName),
      F('level', 'Pavimento de Base', lvlName),
      F('length', 'Comprimento', (el) => dist(el.a, el.b), 'length'),
      F('height', 'Height', wallH, 'length'),
      F('width', 'Width', (el, c) => typeThickness(c.doc.get(el.typeId)), 'length'),
      F('area', 'Area', (el, c) => dist(el.a, el.b) * wallH(el, c), 'area'),
      F('volume', 'Volume', (el, c) => dist(el.a, el.b) * wallH(el, c) * typeThickness(c.doc.get(el.typeId)), 'volume'),
      F('structural', 'Estrutural', (el) => (el.structural ? 'Sim' : 'Não')),
      F('mark', 'Marca', (el) => el.mark ?? '', 'text', 'mark'),
      F('comments', 'Comentários', (el) => el.comments ?? '', 'text', 'comments'),
      COUNT,
    ],
    defaults: ['type', 'level', 'length', 'height', 'area', 'volume'],
  },
  floor: {
    label: 'Pisos',
    kinds: ['floor'],
    fields: [
      F('type', 'Tipo', typeName),
      F('level', 'Pavimento', lvlName),
      F('area', 'Area', slabArea, 'area'),
      F('perimeter', 'Perimeter', (el) => perimeter(el.boundary || []), 'length'),
      F('volume', 'Volume', (el, c) => slabArea(el) * typeThickness(c.doc.get(el.typeId)), 'volume'),
      F('mark', 'Marca', (el) => el.mark ?? '', 'text', 'mark'),
      COUNT,
    ],
    defaults: ['type', 'level', 'area', 'volume'],
  },
  topography: {
    label: 'Terrenos',
    kinds: ['topography'],
    fields: [
      F('name', 'Nome', (el) => el.name || 'Terreno'),
      F('role', 'Estado', (el) => el.role === 'proposed' ? 'Proposto' : 'Existente'),
      F('level', 'Pavimento de Referência', lvlName),
      F('area', 'Área de Implantação', (el) => polyArea(terrainBoundary(el)), 'area'),
      F('points', 'Pontos', (el) => el.points?.length ?? 0, 'number'),
      F('interval', 'Intervalo entre Curvas', (el) => el.contourInterval ?? 500, 'length'),
      COUNT,
    ],
    defaults: ['name', 'role', 'level', 'area', 'points', 'interval'],
  },
  component: {
    label: 'Móveis e Louças',
    kinds: ['component'],
    fields: [
      F('category', 'Categoria', (el, c) => CATEGORIES.find((x) => x.id === c.doc.get(el.typeId)?.category)?.label ?? ''),
      F('family', 'Família', famName),
      F('type', 'Tipo', typeName),
      F('level', 'Pavimento', lvlName),
      F('mark', 'Marca', (el) => el.mark ?? '', 'text', 'mark'),
      F('comments', 'Comentários', (el) => el.comments ?? '', 'text', 'comments'),
      COUNT,
    ],
    defaults: ['category', 'family', 'type', 'level', 'count'],
    group: true,
  },
  column: {
    label: 'Pilares',
    kinds: ['column'],
    fields: [F('type', 'Tipo', typeName), F('level', 'Pavimento de Base', lvlName), F('height', 'Height', wallH, 'length'), F('mark', 'Marca', (el) => el.mark ?? '', 'text', 'mark'), COUNT],
    defaults: ['type', 'level', 'height', 'count'],
    group: true,
  },
  stair: {
    label: 'Escadas',
    kinds: ['stair'],
    fields: [
      F('type', 'Tipo', typeName),
      F('level', 'Pavimento de Base', lvlName),
      F('risers', 'Degraus', (el, c) => stairLayout(c.doc, el).risers, 'number'),
      F('riser', 'Altura do Espelho', (el, c) => stairLayout(c.doc, el).riserHeight, 'length'),
      F('tread', 'Profundidade do Piso', (el, c) => stairLayout(c.doc, el).tread, 'length'),
      F('width', 'Width', (el, c) => stairLayout(c.doc, el).width, 'length'),
      COUNT,
    ],
    defaults: ['type', 'level', 'risers', 'riser', 'tread', 'width'],
  },
};

export function scheduleColumns(doc, view) {
  const cat = SCHEDULE_CATEGORIES[view.category];
  if (!cat) return [];
  const ids = view.fields?.length ? view.fields : cat.defaults;
  return ids.map((id) => cat.fields.find((f) => f.id === id)).filter(Boolean);
}

/**
 * Rows: [{ id (or null for group rows), ids, values: { fieldId: raw } }],
 * sorted, and grouped by type when the schedule is not itemized.
 */
export function scheduleRows(app, view) {
  const cat = SCHEDULE_CATEGORIES[view.category];
  if (!cat) return [];
  const ctx = { doc: app.doc, scene: app.scene };
  const cols = scheduleColumns(app.doc, view);
  const els = cat.kinds.flatMap((k) => app.doc.all(k));
  let rows = els.map((el) => {
    const values = {};
    for (const c of cols) {
      try {
        values[c.id] = c.get(el, ctx);
      } catch {
        values[c.id] = '';
      }
    }
    return { id: el.id, ids: [el.id], values };
  });
  const itemize = view.itemize ?? !cat.group;
  if (!itemize) {
    const groups = new Map();
    const keyCols = cols.filter((c) => c.type === 'text' && !c.edit);
    for (const r of rows) {
      const key = keyCols.map((c) => r.values[c.id]).join('|');
      if (!groups.has(key)) groups.set(key, { id: null, ids: [], values: { ...r.values, count: 0 } });
      const g = groups.get(key);
      g.ids.push(r.id);
      for (const c of cols) {
        if (c.type === 'count') g.values[c.id] = (g.values[c.id] || 0) + 1;
        else if (['area', 'volume', 'length'].includes(c.type) && g.ids.length > 1) g.values[c.id] = (+g.values[c.id] || 0) + (+r.values[c.id] || 0);
        else if (c.edit && g.ids.length > 1 && g.values[c.id] !== r.values[c.id]) g.values[c.id] = '';
      }
    }
    rows = [...groups.values()];
  }
  const sort = view.sortBy && cols.some((c) => c.id === view.sortBy) ? view.sortBy : cols[0]?.id;
  const dir = view.sortDir === 'desc' ? -1 : 1;
  if (sort)
    rows.sort((a, b) => {
      const x = a.values[sort];
      const y = b.values[sort];
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
    });
  return rows;
}

export function formatCell(col, v, units) {
  if (v == null || v === '') return '';
  switch (col.type) {
    case 'length':
      return formatLength(+v, units);
    case 'area':
      return formatArea(+v, units);
    case 'volume':
      return formatVolume(+v, units);
    case 'number':
    case 'count':
      return String(Math.round(+v * 100) / 100);
    default:
      return String(v);
  }
}

export function scheduleTotals(cols, rows) {
  const out = {};
  for (const c of cols) {
    if (c.type === 'count') out[c.id] = rows.reduce((s, r) => s + (+r.values[c.id] || 0), 0);
    else if (c.type === 'area' || c.type === 'volume') out[c.id] = rows.reduce((s, r) => s + (+r.values[c.id] || 0), 0);
  }
  return out;
}

function csvCell(s) {
  const t = String(s ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function toCSV(cols, rows, units) {
  const lines = [cols.map((c) => csvCell(c.label)).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(formatCell(c, r.values[c.id], units))).join(','));
  return lines.join('\r\n');
}
