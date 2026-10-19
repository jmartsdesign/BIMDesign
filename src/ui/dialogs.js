/**
 * Dialogs: new project, type editor (with layer structure), visibility,
 * project information, units, materials, levels, types, snaps, purge,
 * schedules, sheets, sharing, export, command search, shortcuts and help.
 */
import { h, clear, MOD } from './dom.js';
import { icon, KIND_ICON } from './icons.js';
import { openDialog, toast, confirmDialog, promptDialog } from './dialog.js';
import { COMMANDS } from '../commands.js';
import { CATEGORIES, KIND_LABEL, typeThickness, FAMILY_BY_KIND } from '../core/catalog.js';
import { TYPE_PARAMS } from '../core/props.js';
import { formatLength, parseLength, MM_PER_FOOT } from '../core/units.js';
import { uniqueName, deleteElements } from '../core/ops.js';
import { planView } from '../core/template.js';
import { newId, isView } from '../core/doc.js';
import { SCHEDULE_CATEGORIES } from '../core/schedule.js';
import { sheetSize } from '../core/sheet.js';
import { bboxUnion } from '../core/geom.js';
import { createLevel } from '../editor/draw.js';
import * as exporters from '../io/exporters.js';

const field = (label, control, hint) => h('label.field', h('span.field-label', label), control, hint ? h('span.field-hint', hint) : null);

function lengthInput(app, value, label) {
  const input = h('input.input', { type: 'text', value: formatLength(value ?? 0, app.doc.units), 'aria-label': label, spellcheck: 'false' });
  input.read = () => parseLength(input.value, app.doc.units);
  return input;
}

// New project ------------------------------------------------------------------------------

export async function newProjectDialog(app) {
  const pick = await openDialog({
    title: 'Novo Projeto',
    size: 'sm',
    body: h(
      'div.open-sources',
      h('button.btn.big', { type: 'button', onClick: () => document.querySelector('dialog[open]')._close('metric') }, icon('file-plus', 22), h('span', h('strong', 'Métrico'), h('small', 'Milímetros; plantas em 1 : 100'))),
      h('button.btn.big', { type: 'button', onClick: () => document.querySelector('dialog[open]')._close('imperial') }, icon('file-plus', 22), h('span', h('strong', 'Sistema Imperial'), h('small', 'Pés e polegadas; plantas em 1/8" = 1\'-0"'))),
      h('button.btn.big', { type: 'button', onClick: () => document.querySelector('dialog[open]')._close('sample') }, icon('house', 22), h('span', h('strong', 'Casa de exemplo'), h('small', 'Uma casa térrea mobiliada para explorar'))),
    ),
    actions: [{ label: 'Cancelar', value: null }],
  });
  if (pick) await app.startProject(pick);
}

// Levels ----------------------------------------------------------------------------------------

export async function addLevelDialog(app) {
  const lv = app.doc.levels();
  const top = lv.at(-1);
  const step = app.doc.units.system === 'imperial' ? 10 * MM_PER_FOOT : 3000;
  const name = h('input.input', { type: 'text', value: uniqueName(lv.map((l) => l.name), `Pavimento ${lv.length + 1}`) });
  const elev = lengthInput(app, (top?.elevation ?? -step) + step, 'Cota');
  const err = h('p.field-error', { role: 'alert' });
  let result = null;
  await openDialog({
    title: 'Adicionar Pavimento',
    size: 'sm',
    body: h('div', field('Nome', name), field('Cota', elev, 'Plantas baixa e de forro são criadas para o novo pavimento.'), err),
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: 'Adicionar Pavimento',
        primary: true,
        onClick: () => {
          const e = elev.read();
          if (!Number.isFinite(e)) {
            err.textContent = 'Digite uma cota válida.';
            return false;
          }
          result = { name: name.value.trim() || undefined, elevation: e };
          return true;
        },
      },
    ],
  });
  return result;
}

export function levelsDialog(app) {
  const doc = app.doc;
  const body = h('div');
  const render = () => {
    clear(body);
    const table = h('table.layers-table', h('thead', h('tr', h('th', 'Nome'), h('th', 'Cota'), h('th', ''))));
    const tb = h('tbody');
    for (const l of doc.levels()) {
      const name = h('input.input', { type: 'text', value: l.name, 'aria-label': 'Nome do pavimento' });
      name.addEventListener('change', () => name.value.trim() && app.commit('Renomear pavimento', () => doc.update(l.id, { name: name.value.trim() })));
      const elev = lengthInput(app, l.elevation, 'Cota');
      elev.addEventListener('change', () => {
        const v = elev.read();
        if (Number.isFinite(v)) app.commit('Cota do pavimento', () => doc.update(l.id, { elevation: v }));
        else elev.value = formatLength(l.elevation, doc.units);
      });
      const del = h('button.icon-btn.sm', { type: 'button', 'aria-label': `Excluir ${l.name}`, 'data-tip': 'Excluir pavimento', disabled: doc.count('level') <= 1, onClick: async () => {
        const n = doc.filter((e) => e.levelId === l.id).length;
        if (await confirmDialog('Excluir pavimento', `Excluir ${l.name}? Seus ${n} elementos e suas vistas também são excluídos.`, { confirm: 'Excluir', danger: true })) {
          app.commit('Excluir pavimento', () => deleteElements(doc, [l.id]));
          render();
        }
      } }, icon('trash', 15));
      tb.append(h('tr', h('td', name), h('td', elev), h('td', del)));
    }
    table.append(tb);
    body.append(table, h('div', { style: { marginTop: '10px' } }, h('button.btn.sm', { type: 'button', onClick: async () => {
      const r = await addLevelDialog(app);
      if (r) createLevel(app, r.elevation, r.name);
      render();
    } }, icon('plus', 14), 'Adicionar Pavimento')));
  };
  render();
  return openDialog({ title: 'Pavimentos', body, size: 'md', actions: [{ label: 'Fechar', primary: true, value: null }] });
}

export async function topographyImportOptions(app, fileName) {
  const units = h('select.input', { 'aria-label': 'Unidade de coordenadas do ficheiro' },
    h('option', { value: '1000' }, 'Metros'),
    h('option', { value: '1' }, 'Milímetros'),
    h('option', { value: '304.8' }, 'Pés'),
  );
  units.value = '1000';
  const level = h('select.input', { 'aria-label': 'Pavimento do terreno' });
  for (const lv of app.doc.levels()) level.append(h('option', { value: lv.id, selected: lv.id === app.activeLevelId() }, lv.name));
  level.value = app.activeLevelId() || app.doc.levels()[0]?.id || '';
  let result = null;
  await openDialog({
    title: 'Importar Topografia',
    size: 'sm',
    body: h('div',
      h('p.field-hint', `As colunas X, Y e Z serão detetadas automaticamente em ${fileName}.`),
      field('Unidade das coordenadas', units),
      field('Pavimento de referência', level),
    ),
    actions: [
      { label: 'Cancelar', value: null },
      { label: 'Importar', primary: true, onClick: () => {
        result = { scale: +units.value, levelId: level.value };
        return true;
      } },
    ],
  });
  return result;
}

// Type editor ---------------------------------------------------------------------------------

export function typeDialog(app, type) {
  const doc = app.doc;
  let t = doc.get(type.id) || type;
  const body = h('div');
  const params = TYPE_PARAMS[t.kind] || [];
  const render = () => {
    t = doc.get(t.id);
    clear(body);
    const fam = t.familyName || FAMILY_BY_KIND[t.kind] || '';
    const typeSel = h('select.input', { 'aria-label': 'Tipo' });
    for (const x of doc.all(t.kind)) if ((x.familyName || '') === (t.familyName || '')) typeSel.append(h('option', { value: x.id, selected: x.id === t.id }, x.name));
    typeSel.addEventListener('change', () => {
      t = doc.get(typeSel.value);
      render();
    });
    const head = h(
      'div',
      { style: { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'end', marginBottom: '12px' } },
      field(`Família: ${fam}`, typeSel),
      h('button.btn', { type: 'button', onClick: async () => {
        const name = await promptDialog('Duplicar Tipo', 'Nome', uniqueName(doc.all(t.kind).map((x) => x.name), `${t.name} 2`));
        if (!name) return;
        const { id: _id, ...rest } = t;
        void _id;
        let c;
        app.commit('Duplicar tipo', () => (c = doc.add({ ...rest, name })));
        t = c;
        render();
      } }, 'Duplicar...'),
      h('button.btn', { type: 'button', onClick: async () => {
        const name = await promptDialog('Renomear Tipo', 'Nome', t.name);
        if (name) app.commit('Renomear tipo', () => doc.update(t.id, { name }));
        render();
      } }, 'Renomear...'),
    );
    body.append(head);
    const used = doc.filter((e) => e.typeId === t.id).length;
    body.append(h('p.field-hint', { style: { marginBottom: '8px' } }, `${used} elemento${used === 1 ? '' : 's'} no projeto ${used === 1 ? 'usa' : 'usam'} este tipo. Alterações se aplicam a todos eles.`));
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(140px, 40%) 1fr', gap: '6px 12px', alignItems: 'center' } });
    for (const p of params) {
      if (p.type === 'button' && p.action === 'edit-layers') continue;
      const label = h('span', { style: { fontSize: 'var(--fs-sm)' } }, p.label);
      let control;
      const v = p.get ? p.get(t, { doc }) : t[p.key];
      const set = (val) => app.commit(`Editar tipo: ${p.label}`, () => doc.update(t.id, { [p.key]: val }));
      if (p.type === 'readonly') control = h('span', { style: { color: 'var(--fg-muted)' } }, typeof v === 'number' ? formatLength(v, doc.units) : String(v ?? ''));
      else if (p.type === 'length') {
        control = lengthInput(app, v ?? 0, p.label);
        control.addEventListener('change', () => {
          const x = control.read();
          if (Number.isFinite(x) && x >= 0) set(x);
          else control.value = formatLength(v ?? 0, doc.units);
        });
      } else if (p.type === 'bool') {
        control = h('input', { type: 'checkbox', checked: !!v, 'aria-label': p.label });
        control.addEventListener('change', () => set(control.checked));
      } else if (p.type === 'select') {
        control = h('select.input', { 'aria-label': p.label }, p.options().map((o) => h('option', { value: o.value, selected: o.value === v }, o.label)));
        control.addEventListener('change', () => set(control.value));
      } else if (p.type === 'material') {
        control = h('select.input', { 'aria-label': p.label }, doc.all('material').map((m) => h('option', { value: m.id, selected: m.id === v }, m.name)));
        control.addEventListener('change', () => set(control.value));
      } else {
        control = h('input.input', { type: 'text', value: v ?? '', 'aria-label': p.label });
        control.addEventListener('change', () => set(control.value));
      }
      grid.append(label, control);
    }
    body.append(grid);
    if (t.layers) body.append(layersEditor(app, t, render));
    if (t.curtain) body.append(curtainEditor(app, t));
  };
  render();
  return openDialog({ title: 'Propriedades do Tipo', body, size: 'lg', actions: [{ label: 'Fechar', primary: true, value: null }] });
}

const LAYER_FUNCS = [
  ['finish', 'Acabamento'],
  ['substrate', 'Substrato'],
  ['structure', 'Estrutura'],
  ['insulation', 'Térmico/Isolamento'],
  ['membrane', 'Membrana'],
  ['air', 'Espaço de Ar'],
];

function layersEditor(app, t, rerender) {
  const doc = app.doc;
  const wrap = h('div', { style: { marginTop: '16px' } });
  const top = t.kind === 'wallType' ? 'Lado externo' : 'Topo';
  const bottom = t.kind === 'wallType' ? 'Lado interno' : 'Base';
  wrap.append(h('h3.dlg-sub', `Estrutura (total ${formatLength(typeThickness(t), doc.units)})`));
  const preview = h('canvas.layer-preview', { width: 600, height: 46, 'aria-hidden': 'true' });
  const draw = () => {
    const ctx = preview.getContext('2d');
    const W = preview.width;
    const H = preview.height;
    ctx.clearRect(0, 0, W, H);
    const total = typeThickness(t) || 1;
    let x = 0;
    for (const l of t.layers) {
      const w = (l.thickness / total) * W;
      ctx.fillStyle = doc.get(l.materialId)?.color || '#ccc';
      ctx.fillRect(x, 0, w, H);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(x + 0.5, 0.5, w - 1, H - 1);
      x += w;
    }
  };
  wrap.append(preview);
  const table = h('table.layers-table', h('thead', h('tr', h('th', '#'), h('th', 'Função'), h('th', 'Material'), h('th', 'Espessura'), h('th', ''))));
  const tb = h('tbody');
  const update = (layers) => {
    app.commit('Editar estrutura', () => doc.update(t.id, { layers }));
    rerender();
  };
  t.layers.forEach((l, i) => {
    const fn = h('select.input', { 'aria-label': `Função da camada ${i + 1}` }, LAYER_FUNCS.map(([v, lab]) => h('option', { value: v, selected: v === l.function }, lab)));
    fn.addEventListener('change', () => update(t.layers.map((x, j) => (j === i ? { ...x, function: fn.value } : x))));
    const mat = h('select.input', { 'aria-label': `Material da camada ${i + 1}` }, doc.all('material').map((m) => h('option', { value: m.id, selected: m.id === l.materialId }, m.name)));
    mat.addEventListener('change', () => update(t.layers.map((x, j) => (j === i ? { ...x, materialId: mat.value } : x))));
    const th = lengthInput(app, l.thickness, `Espessura da camada ${i + 1}`);
    th.addEventListener('change', () => {
      const v = th.read();
      if (Number.isFinite(v) && v > 0) update(t.layers.map((x, j) => (j === i ? { ...x, thickness: v } : x)));
      else th.value = formatLength(l.thickness, doc.units);
    });
    const actions = h(
      'div.inline',
      h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Mover para cima', disabled: i === 0, onClick: () => {
        const a = t.layers.slice();
        [a[i - 1], a[i]] = [a[i], a[i - 1]];
        update(a);
      } }, icon('chevron-up', 14)),
      h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Mover para baixo', disabled: i === t.layers.length - 1, onClick: () => {
        const a = t.layers.slice();
        [a[i + 1], a[i]] = [a[i], a[i + 1]];
        update(a);
      } }, icon('chevron-down', 14)),
      h('button.icon-btn.sm', { type: 'button', 'aria-label': 'Excluir camada', disabled: t.layers.length <= 1, onClick: () => update(t.layers.filter((_, j) => j !== i)) }, icon('trash', 14)),
    );
    tb.append(h('tr', h('td', String(i + 1)), h('td', fn), h('td', mat), h('td', th), h('td', actions)));
  });
  table.append(tb);
  wrap.append(
    h('p.field-hint', `Primeira linha: ${top}. Última linha: ${bottom}.`),
    table,
    h('div', { style: { marginTop: '8px' } }, h('button.btn.sm', { type: 'button', onClick: () => update([...t.layers, { materialId: 'mat-gypsum', thickness: app.doc.units.system === 'imperial' ? 12.7 : 13, function: 'finish' }]) }, icon('plus', 14), 'Inserir Camada')),
  );
  requestAnimationFrame(draw);
  return wrap;
}

function curtainEditor(app, t) {
  const c = t.curtain || {};
  const set = (patch) => app.commit('Grelha da cortina', () => app.doc.update(t.id, { curtain: { ...(app.doc.get(t.id)?.curtain || {}), ...patch } }));
  const hs = lengthInput(app, c.hSpacing, 'Espaçamento vertical da grelha');
  hs.addEventListener('change', () => Number.isFinite(hs.read()) && set({ hSpacing: hs.read() }));
  const vs = lengthInput(app, c.vSpacing, 'Espaçamento horizontal da grelha');
  vs.addEventListener('change', () => Number.isFinite(vs.read()) && set({ vSpacing: vs.read() }));
  const mw = lengthInput(app, c.mullionWidth, 'Largura do montante');
  mw.addEventListener('change', () => Number.isFinite(mw.read()) && set({ mullionWidth: mw.read() }));
  const md = lengthInput(app, c.mullionDepth, 'Profundidade do montante');
  md.addEventListener('change', () => Number.isFinite(md.read()) && set({ mullionDepth: md.read() }));
  return h('div', { style: { marginTop: '16px' } }, h('h3.dlg-sub', 'Grelha da Cortina'), h('div.row2', field('Largura do painel (ao longo da parede)', hs), field('Altura do painel', vs), field('Largura do montante', mw), field('Profundidade do montante', md)));
}

export function typesDialog(app) {
  const doc = app.doc;
  const kinds = ['wallType', 'floorType', 'roofType', 'ceilingType', 'doorType', 'windowType', 'columnType', 'beamType', 'stairType', 'railingType', 'componentType'];
  const list = h('ul.file-list', { style: { maxHeight: '420px' } });
  const kindSel = h('select.input', { 'aria-label': 'Categoria' }, kinds.map((k) => h('option', { value: k }, labelOfTypeKind(k))));
  const render = () => {
    clear(list);
    for (const t of doc.all(kindSel.value)) {
      const n = doc.filter((e) => e.typeId === t.id).length;
      list.append(h('li', h('button.file-item', { type: 'button', onClick: () => typeDialog(app, t) }, icon(KIND_ICON[kindFromType(t.kind)] || 'types', 16), h('span.file-name', `${t.familyName ? `${t.familyName}: ` : ''}${t.name}`), h('span.file-meta', `${n} em uso`))));
    }
  };
  kindSel.addEventListener('change', render);
  render();
  return openDialog({ title: 'Tipos', body: h('div', field('Categoria', kindSel), list), size: 'md', actions: [{ label: 'Fechar', primary: true, value: null }] });
}

function labelOfTypeKind(k) {
  const kind = kindFromType(k);
  return { component: 'Componentes (móveis, louças, equipamentos)' }[kind] || `${KIND_LABEL[kind] || kind}s`;
}

function kindFromType(k) {
  return k.replace(/Type$/, '');
}

// Visibility ----------------------------------------------------------------------------------------

export function visibilityDialog(app) {
  const view = app.activeView;
  if (!view || !isView(view) || view.kind === 'schedule') return toast('Abra uma vista primeiro.', { kind: 'error' });
  const hidden = new Set(view.hiddenCats || []);
  const groups = [
    { title: 'Categorias do modelo', cats: CATEGORIES.filter((c) => c.model) },
    { title: 'Categorias de anotação e outras', cats: CATEGORIES.filter((c) => !c.model) },
  ];
  const body = h('div');
  for (const g of groups) {
    body.append(h('h3.dlg-sub', g.title));
    const grid = h('div.snap-grid');
    for (const c of g.cats) {
      const cb = h('input', { type: 'checkbox', checked: !hidden.has(c.id) });
      cb.addEventListener('change', () => (cb.checked ? hidden.delete(c.id) : hidden.add(c.id)));
      grid.append(h('label.check', cb, c.label));
    }
    body.append(grid);
  }
  const hiddenIds = view.hiddenIds || [];
  let clearIds = false;
  if (hiddenIds.length) {
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => (clearIds = cb.checked));
    body.append(h('h3.dlg-sub', 'Elementos ocultos'), h('label.check', cb, `Mostrar ${hiddenIds.length} elemento${hiddenIds.length === 1 ? '' : 's'} oculto${hiddenIds.length === 1 ? '' : 's'} individualmente nesta vista`));
  }
  return openDialog({
    title: `Visibilidade/Gráficos: ${view.name}`,
    body,
    size: 'md',
    actions: [
      { label: 'Cancelar', value: null },
      { label: 'OK', primary: true, onClick: () => app.commit('Visibilidade/Gráficos', () => app.doc.update(view.id, { hiddenCats: [...hidden], ...(clearIds ? { hiddenIds: [] } : {}) })) },
    ],
  });
}

// Project ----------------------------------------------------------------------------------------------

export function projectInfoDialog(app) {
  const p = app.doc.project;
  const fields = [
    ['name', 'Nome do projeto'],
    ['number', 'Número do projeto'],
    ['client', 'Cliente'],
    ['address', 'Endereço'],
    ['author', 'Autor'],
    ['status', 'Status'],
  ];
  const inputs = {};
  const body = h('div.row2', fields.map(([k, l]) => field(l, (inputs[k] = h('input.input', { type: 'text', value: p[k] || '' })))));
  return openDialog({
    title: 'Informações do Projeto',
    body,
    size: 'md',
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: 'OK',
        primary: true,
        onClick: () => {
          const patch = {};
          for (const [k] of fields) patch[k] = inputs[k].value.trim();
          app.commit('Informações do projeto', () => app.doc.update('project', patch));
          app.updateTitle();
        },
      },
    ],
  });
}

export function unitsDialog(app) {
  const u = { ...app.doc.units };
  const sys = h('select.input', {}, h('option', { value: 'metric' }, 'Métrico'), h('option', { value: 'imperial' }, 'Imperial (pés e polegadas)'));
  sys.value = u.system;
  const metric = h('select.input', {}, h('option', { value: 'mm' }, 'Milímetros'), h('option', { value: 'cm' }, 'Centímetros'), h('option', { value: 'm' }, 'Metros'));
  metric.value = u.metric || 'mm';
  const dec = h('select.input', {}, [0, 1, 2, 3].map((d) => h('option', { value: d }, String(d))));
  dec.value = String(u.decimals || 0);
  const frac = h('select.input', {}, [2, 4, 8, 16, 32, 64].map((d) => h('option', { value: d }, `1/${d}"`)));
  frac.value = String(u.fraction || 8);
  const metricBox = h('div.row2', field('Unidade de comprimento', metric), field('Casas decimais', dec));
  const impBox = h('div', field('Arredondar para o mais próximo', frac));
  const sync = () => {
    metricBox.hidden = sys.value !== 'metric';
    impBox.hidden = sys.value !== 'imperial';
  };
  sys.addEventListener('change', sync);
  sync();
  return openDialog({
    title: 'Unidades do Projeto',
    body: h('div', field('Sistema de unidades', sys, 'Altera como os comprimentos são exibidos e digitados. O modelo em si não muda.'), metricBox, impBox),
    size: 'sm',
    actions: [
      { label: 'Cancelar', value: null },
      { label: 'OK', primary: true, onClick: () => app.commit('Unidades do projeto', () => app.doc.update('project', { units: { system: sys.value, metric: metric.value, decimals: +dec.value, fraction: +frac.value } })) },
    ],
  });
}

export function materialsDialog(app) {
  const doc = app.doc;
  const body = h('div');
  const render = () => {
    clear(body);
    const table = h('table.layers-table', h('thead', h('tr', h('th', 'Nome'), h('th', 'Cor'), h('th', 'Padrão de corte'), h('th', 'Opacidade'))));
    const tb = h('tbody');
    for (const m of doc.all('material')) {
      const name = h('input.input', { type: 'text', value: m.name, 'aria-label': 'Nome do material' });
      name.addEventListener('change', () => app.commit('Material', () => doc.update(m.id, { name: name.value })));
      const color = h('input.input', { type: 'color', value: m.color, 'aria-label': `${m.name} color` });
      color.addEventListener('change', () => app.commit('Cor do material', () => doc.update(m.id, { color: color.value })));
      const cut = h('select.input', { 'aria-label': `${m.name} cut pattern` }, ['none', 'solid', 'diag', 'cross', 'concrete', 'insulation', 'brick', 'wood', 'earth'].map((p) => h('option', { value: p, selected: p === m.cut }, ({ none: 'Nenhum', solid: 'Sólido', diag: 'Diagonal', cross: 'Cruzada', concrete: 'Concreto', insulation: 'Isolamento', brick: 'Tijolo', wood: 'Madeira', earth: 'Terra' })[p] || p)));
      cut.addEventListener('change', () => app.commit('Padrão do material', () => doc.update(m.id, { cut: cut.value })));
      const op = h('input.input', { type: 'number', min: 0.05, max: 1, step: 0.05, value: m.opacity ?? 1, 'aria-label': `${m.name} opacity` });
      op.addEventListener('change', () => app.commit('Opacidade do material', () => doc.update(m.id, { opacity: Math.max(0.05, Math.min(1, +op.value || 1)) })));
      tb.append(h('tr', h('td', name), h('td', color), h('td', cut), h('td', op)));
    }
    table.append(tb);
    body.append(
      h('div', { style: { maxHeight: '60vh', overflow: 'auto' } }, table),
      h('div', { style: { marginTop: '8px' } }, h('button.btn.sm', { type: 'button', onClick: () => {
        app.commit('Novo material', () => doc.add({ kind: 'material', name: uniqueName(doc.all('material').map((x) => x.name), 'Material 1'), color: '#b0b0b0', cut: 'none', opacity: 1 }));
        render();
      } }, icon('plus', 14), 'Novo Material')),
    );
  };
  render();
  return openDialog({ title: 'Materiais', body, size: 'lg', actions: [{ label: 'Fechar', primary: true, value: null }] });
}

export function snapsDialog(app) {
  const s = { ...app.settings.snaps };
  const opts = [
    ['enabled', 'Aderência ativada'],
    ['endpoints', 'Pontas'],
    ['midpoints', 'Pontos médios'],
    ['intersections', 'Interseções'],
    ['perpendicular', 'Perpendicular'],
    ['nearest', 'Mais próximo'],
    ['angles', 'Incrementos de ângulo (15 graus)'],
    ['lengths', 'Incrementos de comprimento'],
    ['alignment', 'Alinhamento com pontos próximos'],
  ];
  const grid = h('div.snap-grid');
  for (const [k, l] of opts) {
    const cb = h('input', { type: 'checkbox', checked: s[k] !== false });
    cb.addEventListener('change', () => (s[k] = cb.checked));
    grid.append(h('label.check', cb, l));
  }
  const labels = h('input', { type: 'checkbox', checked: app.settings.snapLabels !== false });
  return openDialog({
    title: 'Aderências',
    body: h('div', grid, h('label.check', labels, 'Mostrar etiquetas de aderência'), h('p.field-hint', 'Segure Shift ao clicar para colocar um ponto sem aderência ou rastreamento de ângulo. Segure Alt para desligar temporariamente as aderências a objetos.')),
    size: 'md',
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: 'OK',
        primary: true,
        onClick: () => {
          app.settingsStore.set('snaps', s);
          app.settingsStore.set('snapLabels', labels.checked);
          app.shell.snapBtn.setAttribute('aria-pressed', String(s.enabled !== false));
        },
      },
    ],
  });
}

export async function purgeDialog(app) {
  const doc = app.doc;
  const used = new Set();
  for (const el of doc.items.values()) {
    if (el.typeId) used.add(el.typeId);
    for (const l of el.layers || []) used.add(l.materialId);
    for (const k of ['materialId', 'panelMaterialId', 'frameMaterialId']) if (el[k]) used.add(el[k]);
    if (el.curtain?.materialId) used.add(el.curtain.materialId);
  }
  const unusedTypes = doc.filter((x) => x.kind.endsWith('Type') && !used.has(x.id));
  // Keep one type per category.
  const keep = new Set();
  for (const k of new Set(unusedTypes.map((t) => t.kind))) if (!doc.all(k).some((t) => used.has(t.id))) keep.add(doc.all(k)[0].id);
  const types = unusedTypes.filter((t) => !keep.has(t.id));
  const mats = doc.all('material').filter((m) => !used.has(m.id) && m.id !== 'mat-default' && m.id !== 'mat-glass');
  if (!types.length && !mats.length) return toast('Nada para limpar: todos os tipos e materiais estão em uso.');
  const ok = await confirmDialog('Limpar Não Usados', `Remover ${types.length} tipo${types.length === 1 ? '' : 's'} não usado${types.length === 1 ? '' : 's'} e ${mats.length} material${mats.length === 1 ? '' : 'is'} não usado${mats.length === 1 ? '' : 's'}? Você pode desfazer isso.`, { confirm: 'Limpar' });
  if (!ok) return;
  app.commit('Limpar não usados', () => [...types, ...mats].forEach((x) => doc.remove(x.id)));
  toast(`Limpos ${types.length + mats.length} itens.`, { kind: 'success' });
}

// Views -------------------------------------------------------------------------------------------------

export function planViewDialog(app) {
  const doc = app.doc;
  const list = h('div');
  const checks = [];
  for (const l of doc.levels()) {
    const cb = h('input', { type: 'checkbox', value: l.id });
    checks.push(cb);
    list.append(h('label.check', cb, l.name));
  }
  const kind = h('select.input', {}, h('option', { value: 'plan' }, 'Planta Baixa'), h('option', { value: 'ceilingPlan' }, 'Planta de Forro'));
  return openDialog({
    title: 'Nova Planta',
    body: h('div', field('Tipo', kind), h('h3.dlg-sub', 'Pavimentos'), list),
    size: 'sm',
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: 'Criar',
        primary: true,
        onClick: () => {
          let last;
          const names = doc.filter((x) => isView(x)).map((x) => x.name);
          app.commit('Nova planta', () => {
            for (const cb of checks)
              if (cb.checked) {
                const v = planView(doc, doc.get(cb.value), kind.value);
                v.name = uniqueName(names, v.name);
                names.push(v.name);
                last = doc.add(v);
              }
          });
          if (last) app.openView(last.id);
        },
      },
    ],
  });
}

export function newScheduleDialog(app, category) {
  const sel = h('select.input', { 'aria-label': 'Categoria' }, Object.entries(SCHEDULE_CATEGORIES).map(([k, c]) => h('option', { value: k, selected: k === category }, c.label)));
  const name = h('input.input', { type: 'text', value: '' });
  const sync = () => (name.placeholder = `${SCHEDULE_CATEGORIES[sel.value].label.replace(/s$/, '')} Schedule`);
  sel.addEventListener('change', sync);
  sync();
  return openDialog({
    title: 'Nova Tabela',
    body: h('div', field('Categoria', sel), field('Nome', name)),
    size: 'sm',
    actions: [
      { label: 'Cancelar', value: null },
      {
        label: 'Criar',
        primary: true,
        onClick: () => {
          const names = app.doc.all('schedule').map((s) => s.name);
          const v = { id: newId('v'), kind: 'schedule', name: uniqueName(names, name.value.trim() || name.placeholder), category: sel.value, fields: null, sortBy: null };
          app.commit('Nova tabela', () => app.doc.add(v));
          app.openView(v.id);
        },
      },
    ],
  });
}

export function scheduleFieldsDialog(app, id) {
  const view = app.doc.get(id || app.activeViewId);
  if (!view || view.kind !== 'schedule') return;
  const cat = SCHEDULE_CATEGORIES[view.category];
  const current = view.fields?.length ? view.fields : cat.defaults;
  const order = [...current, ...cat.fields.map((f) => f.id).filter((f) => !current.includes(f))];
  const on = new Set(current);
  const list = h('ul.style-list', { 'aria-label': 'Campos' });
  const render = () => {
    clear(list);
    order.forEach((fid, i) => {
      const f = cat.fields.find((x) => x.id === fid);
      const cb = h('input', { type: 'checkbox', checked: on.has(fid), 'aria-label': f.label });
      cb.addEventListener('change', () => (cb.checked ? on.add(fid) : on.delete(fid)));
      list.append(
        h(
          'li.inline',
          { style: { padding: '2px 4px' } },
          h('label.check.grow', cb, f.label),
          h('button.icon-btn.sm', { type: 'button', 'aria-label': `Mover ${f.label} para cima`, disabled: i === 0, onClick: () => ([order[i - 1], order[i]] = [order[i], order[i - 1]], render()) }, icon('chevron-up', 14)),
          h('button.icon-btn.sm', { type: 'button', 'aria-label': `Mover ${f.label} para baixo`, disabled: i === order.length - 1, onClick: () => ([order[i + 1], order[i]] = [order[i], order[i + 1]], render()) }, icon('chevron-down', 14)),
        ),
      );
    });
  };
  render();
  return openDialog({
    title: `Campos: ${view.name}`,
    body: list,
    size: 'sm',
    actions: [
      { label: 'Cancelar', value: null },
      { label: 'OK', primary: true, onClick: () => app.commit('Campos da tabela', () => app.doc.update(view.id, { fields: order.filter((f) => on.has(f)) })) },
    ],
  });
}

export function newSheet(app) {
  const doc = app.doc;
  const sheets = doc.all('sheet');
  const num = `A${101 + sheets.length}`;
  const imp = doc.units.system === 'imperial';
  const v = { id: newId('v'), kind: 'sheet', number: num, name: 'Sem nome', size: imp ? 'ARCHD' : 'A1', drawnBy: doc.project.author || '', checkedBy: '', issueDate: new Date().toISOString().slice(0, 10) };
  app.commit('Nova prancha', () => doc.add(v));
  app.openView(v.id);
  toast('Prancha criada. Use Colocar Vista na Prancha (aba Vista) para adicionar vistas.');
}

export async function placeViewDialog(app, viewId) {
  const doc = app.doc;
  let sheet = app.activeView?.kind === 'sheet' ? app.activeView : null;
  const placed = new Set(doc.all('viewport').map((v) => v.placedId));
  const views = doc.filter((x) => isView(x) && !['sheet', 'schedule'].includes(x.kind) && !placed.has(x.id));
  if (!views.length) return toast('Todas as vistas já estão em uma prancha. Uma vista pode ser colocada em uma única prancha.', { kind: 'error' });
  const sheetSel = h('select.input', { 'aria-label': 'Prancha' }, doc.all('sheet').map((s) => h('option', { value: s.id, selected: s.id === sheet?.id }, `${s.number} - ${s.name}`)));
  if (!doc.count('sheet')) {
    newSheet(app);
    sheet = app.activeView;
    sheetSel.append(h('option', { value: sheet.id, selected: true }, `${sheet.number} - ${sheet.name}`));
  }
  const viewSel = h('select.input', { 'aria-label': 'Vista' }, views.map((v) => h('option', { value: v.id, selected: v.id === viewId }, `${v.name} (${{ plan: 'Planta Baixa', ceilingPlan: 'Planta de Forro', view3d: '3D', elevation: 'Elevação', section: 'Corte' }[v.kind]})`)));
  const r = await openDialog({ title: 'Colocar Vista na Prancha', body: h('div', field('Prancha', sheetSel), field('Vista', viewSel)), size: 'sm', actions: [{ label: 'Cancelar', value: null }, { label: 'Colocar', primary: true, value: true }] });
  if (!r) return;
  const sh = doc.get(sheetSel.value);
  const view = doc.get(viewSel.value);
  const { w, h: H } = sheetSize(sh);
  const area = { x0: 25, y0: 25, x1: w - Math.min(130, w * 0.18) - 25, y1: H - 25 };
  const at = [(area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2];
  let center = null;
  let size = null;
  if (view.kind === 'plan' || view.kind === 'ceilingPlan') {
    // Center on the view's content.
    const cached = app.controllers.has(view.id);
    const c = app.controllerFor(view);
    c.sync();
    const b = c.extents();
    if (b) center = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    // Only the extents were needed; don't keep GPU layers for a view that isn't open.
    if (!cached && !app.openViews.includes(view.id)) {
      c.dispose?.();
      app.controllers.delete(view.id);
    }
  } else {
    const aw = area.x1 - area.x0;
    const ah = area.y1 - area.y0;
    size = [Math.min(aw, 260), Math.min(ah, 180)];
  }
  const n = doc.all('viewport').filter((x) => x.viewId === sh.id).length + 1;
  app.commit('Colocar vista', () => {
    doc.add({ kind: 'viewport', viewId: sh.id, placedId: view.id, at, center, size });
    doc.update(view.id, { sheetNumber: String(n) });
  });
  app.openView(sh.id);
  toast(`${view.name} colocada em ${sh.number}. Arraste para posicionar.`);
  void bboxUnion;
}

// Export ---------------------------------------------------------------------------------------------------

export async function exportDialog(app, format) {
  const view = app.activeView;
  const formats = [
    ['pdf', 'PDF', 'Vista ou prancha atual, vetorial quando possível', 'printer'],
    ['png', 'Imagem PNG', 'Vista atual em alta resolução', 'image'],
    ['svg', 'SVG', 'Planta ou prancha atual como gráficos vetoriais', 'image'],
    ['dxf', 'DXF', 'Planta atual como linhas 2D para CAD', 'file-text'],
    ['ifc', 'IFC', 'O modelo do edifício para outros softwares BIM', 'ifc'],
    ['obj', 'OBJ', 'O modelo 3D como malha', 'view3d'],
    ['glb', 'glTF (GLB)', 'O modelo 3D para visualização e web', 'view3d'],
    ['csv', 'CSV', 'A tabela atual', 'schedule'],
    ['bdp', 'Arquivo do projeto', 'Baixar o projeto (.bdp)', 'save'],
  ];
  let pick = format;
  if (!pick) {
    pick = await openDialog({
      title: 'Exportar',
      size: 'md',
      body: h(
        'div.open-sources',
        { style: { gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' } },
        formats.map(([id, label, sub, ic]) => h('button.btn.big', { type: 'button', disabled: id === 'csv' && view?.kind !== 'schedule', onClick: () => document.querySelector('dialog[open]')._close(id) }, icon(ic, 20), h('span', h('strong', label), h('small', sub)))),
      ),
      actions: [{ label: 'Cancelar', value: null }],
    });
  }
  if (!pick) return;
  try {
    await exporters.exportAs(app, pick);
  } catch (err) {
    console.error(err);
    toast(`Falha na exportação: ${err.message || err}`, { kind: 'error' });
  }
}

// Command search ----------------------------------------------------------------------------------------------

export function commandPalette(app) {
  const input = h('input.input.palette-input', { type: 'search', placeholder: 'Digite um comando, vista ou atalho', 'aria-label': 'Pesquisar comandos', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', autocomplete: 'off' });
  const list = h('ul.palette-list#palette-list', { role: 'listbox', 'aria-label': 'Resultados' });
  let items = [];
  let idx = 0;
  const all = () => {
    const out = Object.entries(COMMANDS)
      .filter(([, d]) => d.label && !(d.enabled && !d.enabled(app)))
      .map(([name, d]) => ({ label: d.label, icon: d.icon, hint: d.keys || d.accel || '', run: () => app.run(name) }));
    for (const v of app.doc ? app.doc.filter((x) => isView(x)) : []) out.push({ label: `Abrir vista: ${v.name}`, icon: KIND_ICON[v.kind], hint: '', run: () => app.openView(v.id) });
    return out;
  };
  const source = all();
  const render = () => {
    const q = input.value.trim().toLowerCase();
    items = source.filter((x) => !q || x.label.toLowerCase().includes(q) || x.hint.toLowerCase() === q).slice(0, 60);
    idx = Math.min(idx, Math.max(0, items.length - 1));
    clear(list);
    items.forEach((it, i) =>
      list.append(h('li.palette-item', { role: 'option', id: `pal-${i}`, 'aria-selected': String(i === idx), onClick: () => choose(i), onPointerenter: () => ((idx = i), mark()) }, icon(it.icon || 'search', 16), h('span.palette-label', it.label), it.hint ? h('kbd', it.hint) : null)),
    );
    input.setAttribute('aria-activedescendant', items.length ? `pal-${idx}` : '');
  };
  const mark = () => {
    for (const [i, li] of [...list.children].entries()) li.setAttribute('aria-selected', String(i === idx));
    input.setAttribute('aria-activedescendant', `pal-${idx}`);
    list.children[idx]?.scrollIntoView({ block: 'nearest' });
  };
  let close;
  const choose = (i) => {
    const it = items[i];
    if (!it) return;
    close();
    setTimeout(() => it.run(), 0);
  };
  input.addEventListener('input', () => ((idx = 0), render()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(items.length - 1, idx + 1);
      mark();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(0, idx - 1);
      mark();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(idx);
    }
  });
  render();
  const p = openDialog({ title: 'Pesquisar Comandos', body: h('div', input, list), size: 'md', className: 'palette-dlg', initialFocus: 'input' });
  close = () => document.querySelector('dialog[open]')?._close?.(null);
  return p;
}

// Help -----------------------------------------------------------------------------------------------------------

export function shortcutsDialog() {
  const rows = Object.values(COMMANDS)
    .filter((d) => d.keys || d.accel)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((d) => h('div.kbd-row', h('span', d.label), h('span.inline', d.keys ? h('kbd', d.keys) : null, d.accel ? h('kbd', d.accel.replace('Ctrl', MOD)) : null)));
  return openDialog({
    title: 'Atalhos de Teclado',
    body: h('div', h('p.dialog-text', { style: { marginBottom: '10px' } }, 'Digite atalhos de duas letras na vista (não precisa pressionar Enter). Enter repete a última ferramenta, Esc cancela, Tab percorre elementos sobrepostos, Espaço inverte ou gira durante a colocación.'), h('div.kbd-list', rows)),
    size: 'lg',
    actions: [{ label: 'Fechar', primary: true, value: null }],
  });
}

export function helpDialog() {
  const sec = (title, items) => [h('h3.dlg-sub', title), h('ul.help-list', items.map((t) => h('li', t)))];
  return openDialog({
    title: 'Ajuda',
    size: 'lg',
    body: h(
      'div',
      ...sec('Introdução', [
        'Comece na tela inicial com um projeto métrico ou imperial, ou abra a casa de exemplo.',
        'Desenhe paredes com Parede (WA): clique em um ponto inicial e continue clicando; digite um comprimento para inseri-lo exatamente. Esc encerra a sequência.',
        'Coloque portas (DR) e janelas (WN) movendo sobre uma parede; elas cortam suas próprias aberturas. Espaço as inverte.',
        'Crie pisos, forros e coberturas selecionando paredes ou ambientes, ou desenhando seu contorno, depois clique em Concluir.',
        'Coloque ambientes (RM) dentro de áreas fechadas; sua área atualiza conforme as paredes se movem.',
      ]),
      ...sec('Navegação', [
        'Roda: zoom no cursor. Arrastar botão do meio: panorâmica. Rolagem com dois dedos no trackpad faz panorâmica; pinça dá zoom.',
        'Vistas 3D: botão direito ou Shift + arrastar do meio orbita; um dedo orbita em telas de toque. Use o cubo de orientação para vistas padrão.',
        'Zoom para ajustar (ZF), zoom em região (ZR). Duplo clique no espaço vazio em 3D para ajustar.',
      ]),
      ...sec('Seleção e edição', [
        'Clique para selecionar; arraste da esquerda para direita para tudo dentro da caixa, da direita para esquerda para tudo que a caixa toca. Ctrl adiciona, Shift remove.',
        'Arraste elementos selecionados para movê-los, ou use os grips. Paredes unidas em um canto permanecem unidas.',
        'O painel de Propriedades edita a seleção, ou a vista quando nada está selecionado. Editar Tipo altera todos os elementos de um tipo.',
        'Ferramentas de modificação: Mover (MV), Copiar (CO), Girar (RO), Espelhar (MM), Alinhar (AL), Deslocar (OF), Cortar/Estender (TR), Dividir (SL), Matriz (AR).',
      ]),
      ...sec('Vistas e documentos', [
        'O Navegador de Projeto lista vistas, tabelas, pranchas e tipos. Duplo clique para abrir uma vista ou colocar um tipo.',
        'Adicione cortes e elevações na aba Vista, depois abra-os com duplo clique em seus marcadores.',
        'Tabelas listam portas, janelas, ambientes e mais, atualizam ao vivo e exportam para CSV.',
        'Pranchas contêm vistas com uma legenda e exportam para PDF.',
      ]),
      ...sec('Arquivos', [
        'Projetos são salvos como arquivos .bdp neste dispositivo. Uma cópia de recuperação fica neste navegador para que o trabalho sobreviva a um recarregamento.',
        'Exporte para IFC, OBJ e glTF para outras ferramentas 3D e BIM, DXF para CAD, e PDF, SVG ou PNG para desenhos.',
      ]),
    ),
    actions: [{ label: 'Fechar', primary: true, value: null }],
  });
}

export function aboutDialog() {
  return openDialog({
    title: 'Sobre o BIMDesign',
    size: 'sm',
    body: h('div', h('p.dialog-text', 'BIMDesign é um aplicativo gratuito e de código aberto de modelagem de informação da construção que funciona offline no navegador. Está em alfa inicial.'), h('p.dialog-text', { style: { marginTop: '8px' } }, 'Construído com WebGL2. Os projetos são guardados localmente neste dispositivo. Licenciado sob a licença MIT.')),
    actions: [{ label: 'Fechar', primary: true, value: null }],
  });
}

// Phone sheets ----------------------------------------------------------------------------------------------------

function toolGrid(app, cmds, title) {
  const grid = h('div.tool-grid');
  for (const c of cmds) {
    const d = COMMANDS[c];
    if (!d) continue;
    grid.append(h('button.tool-tile', { type: 'button', disabled: d.enabled ? !d.enabled(app) : false, onClick: () => (document.querySelector('dialog[open]')?._close?.(null), setTimeout(() => app.run(c), 0)) }, icon(d.icon, 24), d.label));
  }
  return openDialog({ title, body: grid, size: 'md', className: 'sheet', actions: [] });
}

export function toolsSheet(app) {
  return toolGrid(app, ['wall', 'door', 'window', 'component', 'column', 'floor', 'roof', 'ceiling', 'stair', 'railing', 'room', 'grid', 'dimension', 'text', 'tag', 'section', 'elevation', 'view3d', 'measure', 'level'], 'Ferramentas');
}

export function modifySheet(app) {
  return toolGrid(app, ['modify', 'move', 'copy', 'rotate', 'mirrorPick', 'align', 'offset', 'trim', 'split', 'array', 'delete', 'flip', 'editType', 'tempIsolate', 'tempReset', 'zoomFit', 'save', 'export', 'redo'], 'Modificar');
}
