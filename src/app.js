/**
 * The application: one open project (document + scene), its open views,
 * the selection, the active tool, panels, settings and file handling.
 */
import { buildShell, buildCube } from './ui/shell.js';
import { Ribbon } from './ui/ribbon.js';
import { contextualPanels } from './ui/ribbon-def.js';
import { PropertiesPanel, pluralLabel } from './ui/properties.js';
import { ProjectBrowser } from './ui/browser.js';
import { installTooltips, hideTooltip } from './ui/tooltip.js';
import { showMenu, closeMenus } from './ui/menu.js';
import { toast, confirmDialog, promptDialog } from './ui/dialog.js';
import { h, clear, MOD } from './ui/dom.js';
import { icon, KIND_ICON } from './ui/icons.js';
import { COMMANDS } from './commands.js';
import { Scene, MODEL_KINDS } from './core/scene.js';
import { createProject, default3DView } from './core/template.js';
import { createSampleProject } from './core/sample.js';
import { isView, newId } from './core/doc.js';
import { categoryOf, defaultTypeFor } from './core/catalog.js';
import { describe as describeEl } from './core/props.js';
import { formatArea, formatLength, parseLength } from './core/units.js';
import { temporaryDimensions } from './editor/tempdims.js';
import { drawTempDim } from './views/overlay.js';
import { deleteElements, moveElements, uniqueName } from './core/ops.js';
import { Viewport } from './views/viewport.js';
import { PlanController } from './views/plan.js';
import { ModelController } from './views/model.js';
import { ScheduleController } from './views/schedule.js';
import { SheetController } from './views/sheet.js';
import { SelectTool } from './editor/select.js';
import { SketchTool, createLevel } from './editor/draw.js';
import { FLAG } from './render/gl.js';
import { pointInPolygon as insidePolygon } from './core/geom.js';
import * as dialogs from './ui/dialogs.js';
import * as files from './io/files.js';
import { renderViewbar } from './ui/viewbar.js';
import { renderHome } from './ui/home.js';
import { Settings } from './settings.js';

const PLAN_KINDS = new Set(['plan', 'ceilingPlan']);

export class App {
  constructor(root) {
    this.root = root;
    this.doc = null;
    this.scene = null;
    this.selection = new Set();
    this.hoverId = null;
    this.tool = null;
    this.openViews = [];
    this.activeViewId = null;
    this.controllers = new Map();
    this.viewStates = new Map();
    this.currentTypes = new Map();
    this.toolOpts = new Map();
    this.temp = new Map();
    this.reveal = new Set();
    this.keyBuffer = '';
    this.navMode = null;
    this.clipboard = null;
    this.file = null;
    this.settingsStore = new Settings();
    this.flagsVersion = 0;
  }

  get settings() {
    return this.settingsStore.values;
  }

  get activeView() {
    return this.doc?.get(this.activeViewId) ?? null;
  }

  get vc() {
    return this.controllers.get(this.activeViewId) ?? null;
  }

  // Startup ------------------------------------------------------------------------------

  async start() {
    this.settingsStore.load();
    this.applyTheme();
    this.shell = buildShell(this);
    this.ribbon = new Ribbon(this);
    this.shell.root.querySelector('.ribbon-slot').replaceWith(this.ribbon.el);
    this.root.append(this.shell.root);
    buildCube(this, this.shell.cubeInner, this.shell.viewcube);
    installTooltips(document);
    this.props = new PropertiesPanel(this, this.shell.propsBody);
    this.browser = new ProjectBrowser(this, this.shell.browserBody, this.shell.browserSearch);
    this.viewport = new Viewport(this, this.shell.canvasWrap, this.shell.glCanvas, this.shell.overlay);
    this.bindKeys();
    this.bindDock();
    this.buildPhonebar();
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
    window.addEventListener('beforeunload', (e) => {
      if (this.doc?.modified && this.file?.source !== 'local') {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    const params = new URLSearchParams(location.search);
    const recovered = params.has('sample') ? false : await files.recover(this);
    if (params.has('sample')) this.openSample();
    else if (!recovered) this.showHome();
  }

  fatal(message, err) {
    console.error(err);
    toast(message, { kind: 'error', timeout: 0 });
  }

  toast(msg, opts) {
    return toast(msg, opts);
  }

  // Document --------------------------------------------------------------------------------

  setDoc(doc, file = null) {
    this.cancelTool(true);
    for (const c of this.controllers.values()) c.dispose?.();
    this.controllers.clear();
    this.viewStates.clear();
    this.scene?.dispose();
    this.viewport.r3.clear();
    this.viewport.r3.origin = [0, 0, 0];
    this.originSet = false;
    this.doc = doc;
    this.file = file;
    this.docId = file?.recoveryId || newId('doc');
    this.scene = new Scene(doc);
    this.selection.clear();
    this.hoverId = null;
    this.temp.clear();
    this.reveal.clear();
    this.modelVersion = -1;
    this.currentTypes.clear();
    this.openViews = [];
    this.activeViewId = null;
    doc.on((ev) => this.docChanged(ev));
    const first = doc.all('plan').sort((a, b) => (doc.get(a.levelId)?.elevation ?? 0) - (doc.get(b.levelId)?.elevation ?? 0))[0] || doc.all('view3d')[0];
    if (first) this.openView(first.id);
    this.renderBrowser();
    this.updateTitle();
    this.props.render();
    this.ribbon.refresh();
    this.setPrompt('Pronto');
    files.scheduleRecovery(this);
  }

  docChanged(ev) {
    // Selection may refer to deleted items.
    let selChanged = false;
    for (const id of [...this.selection])
      if (!this.doc.has(id)) {
        this.selection.delete(id);
        selChanged = true;
      }
    // Views closed when deleted.
    for (const id of [...this.openViews]) if (!this.doc.has(id)) this.closeView(id, true);
    if (!ev.preview) {
      this.scene.prune();
      this.renderBrowser();
      this.props.render();
      this.ribbon.refresh();
      this.updateTitle();
      this.renderViewbar();
      files.scheduleRecovery(this);
    }
    if (selChanged) this.selectionChanged();
    this.flagsVersion++;
    this.requestRender();
  }

  undo() {
    if (this.tool && !(this.tool instanceof SelectTool)) this.cancelTool();
    const label = this.doc.undo();
    if (label) this.setPrompt(`Desfeito: ${label}`);
  }

  redo() {
    const label = this.doc.redo();
    if (label) this.setPrompt(`Refeito: ${label}`);
  }

  /** Run fn in a transaction; errors become a toast. Returns fn's result. */
  commit(label, fn) {
    try {
      return this.doc.transact(label, fn);
    } catch (err) {
      console.error(err);
      toast(`Não foi possível concluir "${label}": ${err.message || err}`, { kind: 'error' });
      return undefined;
    }
  }

  // Views -----------------------------------------------------------------------------------

  controllerFor(view) {
    let c = this.controllers.get(view.id);
    if (c) return c;
    if (PLAN_KINDS.has(view.kind)) c = new PlanController(this, view);
    else if (view.kind === 'view3d' || view.kind === 'elevation' || view.kind === 'section') c = new ModelController(this, view);
    else if (view.kind === 'schedule') c = new ScheduleController(this, view);
    else if (view.kind === 'sheet') c = new SheetController(this, view);
    else return null;
    this.controllers.set(view.id, c);
    return c;
  }

  openView(id) {
    const view = this.doc.get(id);
    if (!view || !isView(view)) return;
    if (!this.openViews.includes(id)) this.openViews.push(id);
    this.activateView(id);
  }

  activateView(id) {
    const view = this.doc.get(id);
    if (!view) return;
    const prev = this.vc;
    if (this.tool && !(this.tool instanceof SelectTool)) {
      const kinds = this.tool.viewKinds;
      if (kinds && !kinds.includes(view.kind)) this.cancelTool(true);
    }
    this.activeViewId = id;
    const c = this.controllerFor(view);
    if (prev && prev !== c) prev.deactivate?.();
    const graphical = !!c?.graphical;
    this.shell.domView.hidden = graphical;
    this.viewport.setController(graphical ? c : null);
    if (!graphical) {
      this.shell.viewcube.hidden = true;
      c?.mount(this.shell.domView);
    }
    this.renderNav();
    this.renderTabs();
    this.renderViewbar();
    this.renderBrowser();
    this.props.render();
    this.updateTitle();
    this.flagsVersion++;
    this.requestRender();
    this.ribbon.refresh();
  }

  closeView(id, silent = false) {
    const i = this.openViews.indexOf(id);
    if (i < 0) return;
    this.openViews.splice(i, 1);
    const c = this.controllers.get(id);
    if (c) {
      c.deactivate?.();
      c.dispose?.();
      this.controllers.delete(id);
    }
    if (this.activeViewId === id) {
      const next = this.openViews[Math.min(i, this.openViews.length - 1)];
      if (next) this.activateView(next);
      else {
        this.activeViewId = null;
        this.viewport.setController(null);
        this.showHome(true);
      }
    } else if (!silent) this.renderTabs();
    this.renderTabs();
  }

  closeInactiveViews() {
    for (const id of [...this.openViews]) if (id !== this.activeViewId) this.closeView(id, true);
    this.renderTabs();
  }

  cycleView(dir) {
    if (this.openViews.length < 2) return;
    const i = this.openViews.indexOf(this.activeViewId);
    this.activateView(this.openViews[(i + dir + this.openViews.length) % this.openViews.length]);
  }

  selectViewInBrowser(view) {
    // A single click on a view shows its properties without opening it.
    this.browserViewSel = view.id;
  }

  renderTabs() {
    const el = this.shell.vtabs;
    clear(el);
    this.openViews.forEach((id, i) => {
      const v = this.doc?.get(id);
      if (!v) return;
      const active = id === this.activeViewId;
      el.append(
        h(
          `div.vtab${active ? '.active' : ''}`,
          { role: 'presentation' },
          h(
            'button.vtab-btn',
            {
              type: 'button',
              role: 'tab',
              'aria-selected': String(active),
              tabindex: active ? '0' : '-1',
              title: v.name,
              onClick: () => this.activateView(id),
              onAuxclick: (e) => e.button === 1 && this.closeView(id),
              onKeydown: (e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + this.openViews.length) % this.openViews.length;
                  this.activateView(this.openViews[j]);
                  requestAnimationFrame(() => el.querySelector('.vtab.active .vtab-btn')?.focus());
                } else if (e.key === 'Delete') {
                  e.preventDefault();
                  e.stopPropagation();
                  this.closeView(id);
                }
              },
              onContextmenu: (e) => {
                e.preventDefault();
                showMenu({ x: e.clientX, y: e.clientY }, [
                  { label: 'Fechar', icon: 'x', action: () => this.closeView(id) },
                  { label: 'Fechar Vistas Inativas', icon: 'closeHidden', action: () => this.closeInactiveViews() },
                ]);
              },
            },
            icon(KIND_ICON[v.kind] || 'file', 14),
            h('span.vtab-name', this.viewName(v)),
          ),
          h('button.icon-btn.sm.vtab-close', { type: 'button', tabindex: '-1', 'aria-hidden': 'true', title: `Fechar ${v.name}`, onClick: () => this.closeView(id) }, icon('x', 13)),
        ),
      );
    });
    el.querySelector('.vtab.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  renderNav() {
    const nav = this.shell.nav;
    clear(nav);
    const c = this.vc;
    nav.hidden = !c?.graphical;
    if (!c?.graphical) return;
    nav.classList.toggle('plan', !c.is3D);
    const btn = (cmd, label, ic, onClick) => h('button.icon-btn', { type: 'button', 'aria-label': label, 'data-tip': label, onClick }, icon(ic, 17));
    nav.append(
      btn('zoomFit', 'Zoom para ajustar', 'zoomFit', () => this.zoomFit()),
      btn('zoomIn', 'Aumentar zoom', 'zoom-in', () => c.zoomBy(1.5)),
      btn('zoomOut', 'Diminuir zoom', 'zoom-out', () => c.zoomBy(1 / 1.5)),
      btn('zoomRegion', 'Zoom em região', 'zoomRegion', () => this.run('zoomRegion')),
    );
    const panBtn = btn('navPan', 'Panorâmica com o botão esquerdo ou um dedo', 'hand', () => this.setNavMode(this.navMode === 'pan' ? null : 'pan'));
    panBtn.setAttribute('aria-pressed', String(this.navMode === 'pan'));
    nav.append(panBtn);
    if (c.is3D) {
      const orbitBtn = btn('navOrbit', 'Órbita com o botão esquerdo', 'orbit', () => this.setNavMode(this.navMode === 'orbit' ? null : 'orbit'));
      orbitBtn.setAttribute('aria-pressed', String(this.navMode === 'orbit'));
      nav.append(orbitBtn);
    }
  }

  setNavMode(m) {
    this.navMode = m;
    this.renderNav();
    this.setPrompt(m === 'pan' ? 'Modo panorâmica: arraste para mover. Clique na mão novamente para sair.' : m === 'orbit' ? 'Modo órbita: arraste para orbitar. Clique no botão novamente para sair.' : 'Pronto');
  }

  renderViewbar() {
    renderViewbar(this);
    this.renderBanner();
  }

  renderBanner() {
    const b = this.shell.banner;
    const t = this.temp.get(this.activeViewId);
    const reveal = this.reveal.has(this.activeViewId);
    clear(b);
    b.hidden = !t && !reveal;
    if (t) b.append(h('span', t.mode === 'isolate' ? 'Isolamento temporário' : 'Ocultação temporária'), h('button.btn.sm', { type: 'button', onClick: () => this.temporary('reset') }, 'Redefinir'));
    else if (reveal) b.append(h('span', 'Revelando elementos ocultos'), h('button.btn.sm', { type: 'button', onClick: () => this.toggleReveal() }, 'Fechar'));
  }

  zoomFit() {
    const c = this.vc;
    if (!c) return;
    if (c.is2D) c.zoomExtents();
    else c.zoomExtents?.();
    this.viewChanged();
  }

  viewChanged() {
    const c = this.vc;
    if (c?.cam) this.viewStates.set(this.activeViewId, structuredClone(c.cam));
    this.updateCoords();
  }

  orient3D(yaw, pitch, fit = false) {
    const c = this.vc;
    if (c?.is3D) c.orient(yaw, pitch, fit);
  }

  open3D() {
    let v = this.doc.all('view3d')[0];
    if (!v) {
      v = default3DView();
      this.commit('Vista 3D', () => this.doc.add(v));
    }
    this.openView(v.id);
  }

  new3DView() {
    const names = this.doc.all('view3d').map((v) => v.name);
    const v = { ...default3DView(uniqueName(names, 'Vista 3D 2')) };
    this.commit('Nova vista 3D', () => this.doc.add(v));
    this.openView(v.id);
  }

  duplicateView(id) {
    const v = this.doc.get(id || this.activeViewId);
    if (!v || !isView(v) || v.kind === 'schedule' || v.kind === 'sheet') return this.toast('Escolha uma planta, vista 3D ou corte para duplicar.', { kind: 'error' });
    const names = this.doc.filter((x) => isView(x)).map((x) => x.name);
    const { id: _id, ...rest } = v;
    void _id;
    let copy;
    this.commit('Duplicar vista', () => (copy = this.doc.add({ ...rest, id: newId('v'), name: uniqueName(names, `${v.name} Cópia 1`) })));
    if (copy) this.openView(copy.id);
  }

  /** The level new elements go on: the plan's level, else the first level. */
  activeLevelId() {
    const v = this.activeView;
    if (v?.levelId) return v.levelId;
    return this.lastLevelId && this.doc.has(this.lastLevelId) ? this.lastLevelId : this.doc.levels()[0]?.id;
  }

  requirePlan() {
    const v = this.activeView;
    if (v && PLAN_KINDS.has(v.kind)) return true;
    const plan = this.doc.all('plan').find((p) => p.levelId === this.activeLevelId()) || this.doc.all('plan')[0];
    if (plan) {
      this.openView(plan.id);
      this.toast(`Mudou para ${plan.name}: esta ferramenta funciona em plantas baixas.`);
      return true;
    }
    return false;
  }

  // Model sync for 3D ------------------------------------------------------------------------------

  syncModel() {
    if (this.modelVersion === this.scene.version) return;
    const r3 = this.viewport.r3;
    const keep = new Set();
    for (const k of MODEL_KINDS)
      for (const el of this.doc.all(k)) {
        const m = this.scene.mesh(el);
        if (!m) continue;
        keep.add(el.id);
        r3.set(el.id, this.scene.indexOf(el.id), m);
      }
    r3.retain(keep);
    if (!this.originSet) {
      const b = r3.bounds();
      if (b) {
        // Keep vertex coordinates small near the model for float precision.
        r3.origin = [Math.round((b.min[0] + b.max[0]) / 2e4) * 1e4, Math.round((b.min[1] + b.max[1]) / 2e4) * 1e4, 0];
        for (const c of r3.chunks) c.dirty = true;
        this.originSet = true;
      }
    }
    this.modelVersion = this.scene.version;
  }

  requestRender() {
    this.viewport?.requestRender();
  }

  // Selection and highlight ----------------------------------------------------------------------------

  select(ids, mode = 'replace') {
    const before = [...this.selection].join();
    if (mode === 'replace') this.selection = new Set(ids);
    else if (mode === 'add') ids.forEach((id) => this.selection.add(id));
    else if (mode === 'remove') ids.forEach((id) => this.selection.delete(id));
    if ([...this.selection].join() !== before) this.selectionChanged();
  }

  selectionChanged() {
    this.props.filter = null;
    this.flagsVersion++;
    this.props.render();
    this.updateContextual();
    this.updateSelInfo();
    this.ribbon.refresh();
    if (this.tool instanceof SelectTool || !this.tool) this.setPrompt(this.tool?.prompt || 'Pronto');
    this.requestRender();
  }

  refreshSelection() {
    this.props.render();
    this.requestRender();
  }

  updateContextual() {
    if (this.tool && !(this.tool instanceof SelectTool)) {
      this.ribbon.setContextual({ id: `tool-${this.tool.constructor.name}`, label: `Modificar | ${this.tool.title}`, panels: contextualPanels([]).slice(1, 2) });
      return;
    }
    const sel = [...this.selection].map((id) => this.doc.get(id)).filter(Boolean);
    if (!sel.length) return this.ribbon.setContextual(null);
    const kinds = [...new Set(sel.map((e) => e.kind))];
    const label = kinds.length === 1 ? pluralLabel(kinds[0]) : 'Seleção Múltipla';
    this.ribbon.setContextual({ id: `ctx-${kinds.length === 1 ? kinds[0] : 'multi'}`, label: `Modificar | ${label}`, panels: contextualPanels(kinds) });
  }

  updateSelInfo() {
    const n = this.selection.size;
    this.shell.selInfo.textContent = n ? `${n} selecionado${n === 1 ? '' : 's'}` : '';
  }

  setHover(id) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.flagsVersion++;
    const el = id ? this.doc.get(id) : null;
    if (el && (this.tool instanceof SelectTool || !this.tool)) this.setPrompt(this.describe(el));
    else if (!id && (this.tool instanceof SelectTool || !this.tool)) this.setPrompt(this.tool?.prompt || 'Pronto');
    this.requestRender();
  }

  /** Flags for an element in the active view: selection, hover, hidden, isolate. */
  flagsOf(id) {
    if (typeof id === 'string' && id.startsWith('u:')) return FLAG.dim;
    let f = 0;
    if (this.selection.has(id)) f |= FLAG.selected;
    if (this.hoverId === id) f |= FLAG.hover;
    const view = this.activeView;
    if (view) {
      const el = this.doc.get(id);
      const reveal = this.reveal.has(view.id);
      if (el && this.hiddenInView(view, el)) f |= reveal ? FLAG.halftone : FLAG.hidden;
      const t = this.temp.get(view.id);
      if (t) {
        const inSet = t.ids.has(id) || (el?.hostId && t.ids.has(el.hostId));
        if ((t.mode === 'hide' && inSet) || (t.mode === 'isolate' && !inSet && !(el?.kind === 'level' || el?.kind === 'grid'))) f |= reveal ? FLAG.halftone : FLAG.hidden;
      }
      if (el && this.tool?.dimOthers && !this.tool.dimOthers.has(id)) f |= FLAG.dim;
    }
    return f;
  }

  hiddenInView(view, el) {
    if (view.hiddenIds?.includes(el.id)) return true;
    const cat = categoryOf(el, this.doc);
    if (cat && view.hiddenCats?.includes(cat)) return true;
    if (el.hostId) {
      const host = this.doc.get(el.hostId);
      if (host && view.hiddenIds?.includes(host.id)) return true;
    }
    return false;
  }

  /** Refresh the per-element state texture before drawing. */
  updateStateFlags() {
    const key = `${this.flagsVersion}|${this.activeViewId}|${this.scene?.version}`;
    if (this.flagsKey === key) return;
    this.flagsKey = key;
    const entries = [];
    const scene = this.scene;
    if (!scene) return;
    for (let i = 0; i < scene.ids.length; i++) {
      const id = scene.ids[i];
      const f = this.flagsOf(id);
      if (f) entries.push([i + 1, f]);
    }
    this.viewport.state.setAll(entries);
  }

  selectAllInView() {
    const c = this.vc;
    if (!c?.graphical) return;
    let ids = [];
    if (c.is2D) {
      c.sync();
      ids = [...c.layer.items.keys()].filter((id) => !(this.flagsOf(id) & FLAG.hidden));
    } else ids = [...this.viewport.r3.items.keys()].filter((id) => !(this.flagsOf(id) & FLAG.hidden));
    this.select(ids);
  }

  selectSimilar(scope = 'view') {
    const first = this.doc.get([...this.selection][0]);
    if (!first) return;
    const match = (el) => el.kind === first.kind && (first.typeId ? el.typeId === first.typeId : true);
    let ids = this.doc.filter(match).map((e) => e.id);
    if (scope === 'view' && this.vc?.is2D) {
      this.vc.sync();
      ids = ids.filter((id) => this.vc.layer.items.has(id));
    }
    this.select(ids);
    this.setPrompt(`${ids.length} selecionado${ids.length === 1 ? '' : 's'}.`);
  }

  selectInstancesOfType(typeId) {
    this.select(this.doc.filter((e) => e.typeId === typeId).map((e) => e.id));
  }

  viewName(v) {
    return v.kind === 'sheet' ? `${v.number || ''} - ${v.name}` : v.name;
  }

  describe(el) {
    return describeEl(this.doc, el);
  }

  formatArea(v) {
    return formatArea(v, this.doc.units);
  }

  nudge(d) {
    const ids = [...this.selection];
    this.commit('Empurrar', () => moveElements(this.doc, ids, d));
  }

  // Tools ------------------------------------------------------------------------------------

  commandDef(name) {
    return COMMANDS[name];
  }

  run(name, args) {
    const d = COMMANDS[name];
    if (!d) return;
    if (d.enabled && !d.enabled(this)) {
      if (name === 'move' || name === 'copy' || name === 'rotate' || name === 'mirrorPick' || name === 'mirrorDraw' || name === 'array') this.toast('Selecione elementos primeiro.', { kind: 'error' });
      return;
    }
    closeMenus();
    hideTooltip();
    this.lastCommand = name;
    try {
      d.run(this, args);
    } catch (err) {
      console.error(err);
      this.toast(`Algo deu errado: ${err.message}`, { kind: 'error' });
    }
    this.ribbon.refresh();
  }

  isCommandActive(cmd) {
    if (cmd === 'thinLines') return !!this.settings.thinLines;
    if (cmd === 'roomFill') return !!this.activeView?.roomFill;
    if (cmd === 'revealHidden') return this.reveal.has(this.activeViewId);
    if (cmd === 'sectionBox') return !!this.activeView?.sectionBox;
    if (cmd === 'modify') return !this.tool || this.tool instanceof SelectTool;
    if (this.tool && this.tool.commandName === cmd) return true;
    return null;
  }

  startTool(Cls, opts = {}) {
    if (!this.doc) return;
    const probe = new Cls(this, opts);
    const kinds = probe.viewKinds;
    if (kinds && !kinds.includes(this.activeView?.kind)) {
      if (kinds.includes('plan')) {
        if (!this.requirePlan()) return;
      } else {
        const v = this.doc.filter((x) => kinds.includes(x.kind))[0];
        if (!v) return this.toast(`Abra uma vista de ${kinds.join(' ou ')} para usar ${probe.title}.`, { kind: 'error' });
        this.openView(v.id);
        this.toast(`Mudou para ${v.name}.`);
      }
    }
    this.setTool(probe, this.lastCommand);
  }

  setTool(tool, commandName = null) {
    if (this.tool) {
      if (this.doc?.inTransaction) this.doc.rollback();
      this.tool.stop?.();
    }
    this.tool = tool;
    if (tool) tool.commandName = commandName;
    if (tool && !(tool instanceof SelectTool) && commandName) this.lastToolCommand = commandName;
    const ok = tool?.start?.();
    if (ok === false) return;
    this.shell.canvasWrap.style.cursor = tool && !(tool instanceof SelectTool) ? 'crosshair' : '';
    this.renderOptions();
    this.updateContextual();
    this.props.render();
    this.setPrompt(tool?.prompt || 'Pronto');
    this.ribbon.refresh();
    this.requestRender();
    if (tool && !(tool instanceof SelectTool)) this.viewport.overlay.focus({ preventScroll: true });
  }

  cancelTool(silent = false) {
    if (!this.selectTool) this.selectTool = new SelectTool(this);
    if (this.tool === this.selectTool && silent) return;
    this.setTool(this.selectTool);
    this.selectTool.start();
    if (!silent) this.setPrompt('Pronto');
  }

  toolNeedsTouch() {
    return this.tool && !(this.tool instanceof SelectTool);
  }

  toolEvent(type, ev) {
    if (!this.doc) return;
    if (!this.tool) this.cancelTool(true);
    const t = this.tool;
    if (ev) this.lastPointer = ev;
    if (type === 'move') this.updateCoords(ev);
    try {
      if (type === 'down') t.down(ev);
      else if (type === 'move') t.move(ev);
      else if (type === 'up') t.up?.(ev);
      else if (type === 'dblclick') t.dblclick?.(ev);
      else if (type === 'leave') {
        t.leave?.();
        if (t instanceof SelectTool) this.setHover(null);
      }
    } catch (err) {
      console.error(err);
    }
    if (type === 'down' || type === 'up') {
      this.ribbon.refresh();
      this.shell.undoBtn.disabled = !this.doc.canUndo;
    }
  }

  renderOptions() {
    const bar = this.shell.optionsbar;
    clear(bar);
    const t = this.tool;
    if (!t || t instanceof SelectTool) return;
    const opts = t.options?.();
    bar.append(h('span.ob-title', icon(KIND_ICON[t.placingKind] || 'modify', 13), t.title));
    if (opts) for (const o of [].concat(opts)) if (o) bar.append(o);
  }

  setPrompt(text) {
    if (this.shell) this.shell.prompt.textContent = text || '';
  }

  updateCoords(ev) {
    const c = this.vc;
    const el = this.shell.coords;
    if (!ev?.p || !c?.is2D) {
      if (!c?.is2D) el.textContent = '';
      return;
    }
    const u = this.doc.units;
    el.textContent = `X ${formatLength(ev.p[0], u)}   Y ${formatLength(ev.p[1], u)}`;
  }

  /** Remembered options per tool. */
  toolOptions(key, defaults) {
    if (!this.toolOpts.has(key)) this.toolOpts.set(key, { ...defaults });
    const o = this.toolOpts.get(key);
    for (const k in defaults) if (!(k in o)) o[k] = defaults[k];
    return o;
  }

  currentType(kind) {
    const id = this.currentTypes.get(kind);
    return defaultTypeFor(this.doc, kind, id);
  }

  setCurrentType(kind, typeId) {
    this.currentTypes.set(kind, typeId);
  }

  placeType(type, kind) {
    this.setCurrentType(kind, type.id);
    const cmd = { wall: 'wall', door: 'door', window: 'window', floor: 'floor', roof: 'roof', ceiling: 'ceiling', column: 'column', beam: 'beam', stair: 'stair', railing: 'railing', component: 'component' }[kind];
    if (cmd) this.run(cmd);
  }

  showTypeProperties(type, kind) {
    this.setCurrentType(kind, type.id);
  }

  // Elements -----------------------------------------------------------------------------------

  editElement(id, ev) {
    const el = this.doc.get(id);
    if (!el) return;
    if (el.kind === 'section' || el.kind === 'elevation') return this.openView(el.id);
    if (el.kind === 'floor' || el.kind === 'roof' || el.kind === 'ceiling' || el.kind === 'railing') {
      this.select([id]);
      return this.editBoundary();
    }
    if (el.kind === 'text') return this.editText(el, ev);
    if (el.kind === 'level') {
      const plan = this.doc.all('plan').find((p) => p.levelId === el.id);
      if (plan) return this.openView(plan.id);
    }
    if (el.typeId) return this.editTypeDialog(this.doc.get(el.typeId));
  }

  editText(el, ev) {
    const t = this.tool instanceof SelectTool ? this.tool : null;
    if (!t) return;
    t.openInput(ev.x, ev.y, {
      label: 'Editar texto',
      multiline: true,
      value: el.text,
      onSubmit: (v) => {
        if (v.trim()) this.commit('Editar texto', () => this.doc.update(el.id, { text: v }));
        return true;
      },
    });
  }

  editBoundary() {
    const el = this.doc.get([...this.selection][0]);
    if (!el || !['floor', 'roof', 'ceiling', 'railing'].includes(el.kind)) return this.toast('Selecione um piso, cobertura, forro ou guarda-corpo.', { kind: 'error' });
    if (!this.requirePlan()) return;
    this.select([]);
    this.setTool(new SketchTool(this, { kind: el.kind, editId: el.id }), 'editBoundary');
    this.toast('Redesenhe o contorno e clique em Concluir. Dica: para ajustar alguns cantos, selecione o elemento e arraste os grips dos vértices.');
  }

  /** Attach (or detach) the tops of the selected walls to the roof above each. */
  attachTop(attach) {
    const doc = this.doc;
    const walls = [...this.selection].map((id) => doc.get(id)).filter((el) => el?.kind === 'wall');
    if (!walls.length) return this.toast('Selecione paredes primeiro.', { kind: 'error' });
    let n = 0;
    this.commit(attach ? 'Anexar topo' : 'Desanexar topo', () => {
      for (const w of walls) {
        if (!attach) {
          if (w.attachTopId) {
            doc.update(w.id, { attachTopId: null });
            n++;
          }
          continue;
        }
        const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
        const baseZ = (doc.get(w.levelId)?.elevation ?? 0) + (+w.baseOffset || 0);
        const roof = doc
          .all('roof')
          .filter((r) => (doc.get(r.levelId)?.elevation ?? 0) + (+r.baseOffset || 0) > baseZ && insidePolygon(m, r.boundary))
          .sort((a, b) => (doc.get(a.levelId)?.elevation ?? 0) - (doc.get(b.levelId)?.elevation ?? 0))[0];
        if (!roof) continue;
        doc.update(w.id, { attachTopId: roof.id });
        n++;
      }
    });
    if (attach) this.toast(n ? `${n} parede${n === 1 ? '' : 's'} anexada${n === 1 ? '' : 's'} à cobertura.` : 'Nenhuma cobertura foi encontrada acima das paredes selecionadas.', { kind: n ? 'success' : 'error' });
  }

  flipSelection() {
    this.commit('Inverter', () => {
      for (const id of this.selection) {
        const el = this.doc.get(id);
        if (el?.kind === 'wall') this.doc.update(id, { flipped: !el.flipped });
        else if (el?.kind === 'door' || el?.kind === 'window') this.doc.update(id, { flipFacing: !el.flipFacing });
        else if (el?.kind === 'section') this.doc.update(id, { flip: !el.flip });
      }
    });
  }

  renameItem(id) {
    const it = this.doc.get(id);
    if (!it) return;
    promptDialog('Renomear', 'Nome', it.name || '', { validate: (v) => (!v ? 'Digite um nome.' : null) }).then((name) => {
      if (name && name !== it.name) this.commit('Renomear', () => this.doc.update(id, { name }));
    });
  }

  async deleteItem(id) {
    const it = this.doc.get(id);
    if (!it) return;
    if (it.kind.endsWith('Type')) {
      const used = this.doc.filter((e) => e.typeId === id).length;
      if (this.doc.all(it.kind).length <= 1) return this.toast('Uma categoria precisa de pelo menos um tipo.', { kind: 'error' });
      if (used) {
        const ok = await confirmDialog('Excluir tipo', `${used} elemento${used === 1 ? ' usa' : 's usam'} este tipo e também será${used === 1 ? '' : 'ão'} excluído${used === 1 ? '' : 's'}.`, { confirm: 'Excluir', danger: true });
        if (!ok) return;
      }
      this.commit('Excluir tipo', () => deleteElements(this.doc, [id, ...this.doc.filter((e) => e.typeId === id).map((e) => e.id)]));
      return;
    }
    if (isView(it)) {
      const ok = await confirmDialog('Excluir vista', `Excluir "${it.name}"? As anotações desenhadas nela também são excluídas.`, { confirm: 'Excluir', danger: true });
      if (!ok) return;
    }
    this.commit('Excluir', () => deleteElements(this.doc, [id]));
  }

  duplicateType(t) {
    const names = this.doc.all(t.kind).map((x) => x.name);
    const { id: _id, ...rest } = t;
    void _id;
    let copy;
    this.commit('Duplicar tipo', () => (copy = this.doc.add({ ...rest, name: uniqueName(names, `${t.name} 2`) })));
    if (copy) this.editTypeDialog(copy);
  }

  levelCommand() {
    const v = this.activeView;
    if (v && (v.kind === 'elevation' || v.kind === 'section')) return this.run('levelInElevation');
    dialogs.addLevelDialog(this).then((r) => {
      if (r) createLevel(this, r.elevation, r.name);
    });
  }

  toggleViewProp(key) {
    const v = this.activeView;
    if (!v) return;
    this.commit('Visualizar', () => this.doc.update(v.id, { [key]: !v[key] }));
  }

  hideInView(what) {
    const v = this.activeView;
    if (!v || !this.selection.size) return;
    const sel = [...this.selection].map((id) => this.doc.get(id)).filter(Boolean);
    if (what === 'category') {
      const cats = new Set([...(v.hiddenCats || []), ...sel.map((e) => categoryOf(e, this.doc)).filter(Boolean)]);
      this.commit('Ocultar categoria', () => this.doc.update(v.id, { hiddenCats: [...cats] }));
    } else {
      const ids = new Set([...(v.hiddenIds || []), ...sel.map((e) => e.id)]);
      this.commit('Ocultar na vista', () => this.doc.update(v.id, { hiddenIds: [...ids] }));
    }
    this.select([]);
    this.setPrompt('Oculto nesta vista. Use Revelar Elementos Ocultos para exibi-los e reexibi-los.');
  }

  unhideSelected() {
    const v = this.activeView;
    if (!v) return;
    const sel = new Set(this.selection);
    const cats = new Set([...this.selection].map((id) => categoryOf(this.doc.get(id), this.doc)));
    this.commit('Reexibir', () => this.doc.update(v.id, { hiddenIds: (v.hiddenIds || []).filter((id) => !sel.has(id)), hiddenCats: (v.hiddenCats || []).filter((c) => !cats.has(c)) }));
  }

  temporary(mode) {
    const id = this.activeViewId;
    if (mode === 'reset') this.temp.delete(id);
    else {
      if (!this.selection.size) return;
      this.temp.set(id, { mode, ids: new Set(this.selection) });
      this.select([]);
    }
    this.flagsVersion++;
    this.renderViewbar();
    this.requestRender();
  }

  toggleReveal() {
    const id = this.activeViewId;
    if (this.reveal.has(id)) this.reveal.delete(id);
    else this.reveal.add(id);
    this.flagsVersion++;
    this.renderViewbar();
    this.ribbon.refresh();
    this.requestRender();
  }

  toggleSectionBox() {
    const v = this.activeView;
    if (v?.kind !== 'view3d') return this.toast('Abra uma vista 3D para usar a caixa de corte.', { kind: 'error' });
    if (v.sectionBox) this.commit('Caixa de corte', () => this.doc.update(v.id, { sectionBox: null }));
    else {
      this.syncModel();
      const ids = this.selection.size ? this.selection : null;
      const b = this.viewport.r3.bounds(ids);
      if (!b) return;
      const pad = 300;
      this.commit('Caixa de corte', () => this.doc.update(v.id, { sectionBox: { min: b.min.map((x) => x - pad), max: b.max.map((x) => x + pad) } }));
    }
    this.renderViewbar();
  }

  toggleSetting(key) {
    this.settingsStore.set(key, !this.settings[key]);
    this.ribbon.refresh();
    this.renderViewbar();
    this.requestRender();
  }

  toggleSnaps() {
    const s = { ...this.settings.snaps, enabled: this.settings.snaps.enabled === false };
    this.settingsStore.set('snaps', s);
    this.shell.snapBtn.setAttribute('aria-pressed', String(s.enabled !== false));
    this.setPrompt(s.enabled !== false ? 'Aderências ativadas' : 'Aderências desativadas');
  }

  togglePane(which) {
    const dock = this.shell.dock;
    const phone = matchMedia('(max-width: 760px)').matches;
    if (phone) {
      const open = dock.classList.contains('phone-open') && dock.classList.contains(`phone-${which}`);
      dock.classList.remove('phone-open', 'phone-props', 'phone-browser');
      if (!open) dock.classList.add('phone-open', `phone-${which}`);
      this.renderPhonebar();
      return;
    }
    const cls = which === 'props' ? 'props-hidden' : 'browser-hidden';
    const other = which === 'props' ? 'browser-hidden' : 'props-hidden';
    if (dock.classList.contains(cls)) dock.classList.remove(cls);
    else if (dock.classList.contains(other)) {
      // Hiding the last pane hides the whole dock.
      this.shell.main.classList.toggle('dock-hidden');
    } else dock.classList.add(cls);
    this.settingsStore.set('dockState', { props: !dock.classList.contains('props-hidden'), browser: !dock.classList.contains('browser-hidden'), hidden: this.shell.main.classList.contains('dock-hidden') });
  }

  // Context menu ----------------------------------------------------------------------------------

  contextMenu(ev) {
    const c = this.vc;
    if (!c) return;
    let hit = null;
    if (c.hitTest) hit = c.hitTest(ev.x, ev.y)[0] ?? null;
    if (hit && !this.selection.has(hit)) this.select([hit]);
    const sel = this.selection.size;
    const items = [];
    if (this.tool && !(this.tool instanceof SelectTool)) items.push({ label: 'Cancelar', icon: 'x', action: () => this.cancelTool() });
    if (this.lastToolCommand) items.push({ label: `Repetir ${COMMANDS[this.lastToolCommand]?.label}`, icon: COMMANDS[this.lastToolCommand]?.icon, action: () => this.run(this.lastToolCommand) });
    if (items.length) items.push({ separator: true });
    if (sel) {
      items.push(
        { label: 'Selecionar Todas as Instâncias na Vista', icon: 'pointer', action: () => this.selectSimilar('view') },
        { label: 'Selecionar Todas as Instâncias no Projeto', icon: 'pointer', action: () => this.selectSimilar('project') },
        { separator: true },
        { label: 'Mover', icon: 'move', shortcut: 'MV', action: () => this.run('move') },
        { label: 'Copiar', icon: 'copyEl', shortcut: 'CO', action: () => this.run('copy') },
        { label: 'Girar', icon: 'rotate', shortcut: 'RO', action: () => this.run('rotate') },
        { label: 'Espelhar', icon: 'mirror', shortcut: 'MM', action: () => this.run('mirrorPick') },
        { separator: true },
        { label: 'Ocultar na Vista', icon: 'hideEl', submenu: [
          { label: 'Elementos', action: () => this.hideInView('element') },
          { label: 'Categoria', action: () => this.hideInView('category') },
        ] },
        { label: 'Isolar Temporariamente', icon: 'isolate', shortcut: 'HI', action: () => this.temporary('isolate') },
        this.reveal.has(this.activeViewId) ? { label: 'Reexibir na Vista', icon: 'eye', action: () => this.unhideSelected() } : null,
        { separator: true },
        { label: 'Editar Tipo', icon: 'types', action: () => this.editTypeDialog() },
        { label: 'Excluir', icon: 'trash', shortcut: 'Del', action: () => this.run('delete') },
      );
    } else {
      items.push(
        { label: 'Zoom para Ajustar', icon: 'zoomFit', shortcut: 'ZF', action: () => this.zoomFit() },
        { label: 'Zoom em Região', icon: 'zoomRegion', shortcut: 'ZR', action: () => this.run('zoomRegion') },
        this.clipboard ? { label: 'Colar', icon: 'paste', shortcut: `${MOD}+V`, action: () => this.paste() } : null,
        { label: 'Selecionar Tudo na Vista', icon: 'pointer', shortcut: `${MOD}+A`, action: () => this.selectAllInView() },
        { separator: true },
        { label: 'Propriedades da Vista', icon: 'sliders', action: () => this.togglePane('props') },
      );
    }
    showMenu({ x: ev.original.clientX, y: ev.original.clientY }, items.filter(Boolean), { label: 'Menu de contexto' });
  }

  // Clipboard ------------------------------------------------------------------------------------

  copyToClipboard(cut = false) {
    const ids = [...this.selection];
    const items = ids.map((id) => this.doc.get(id)).filter((el) => el && !isView(el) && el.kind !== 'level' && el.id !== 'project');
    if (!items.length) return;
    // Hosted elements of copied walls come along.
    const set = new Set(items.map((e) => e.id));
    for (const k of ['door', 'window', 'opening']) for (const el of this.doc.all(k)) if (set.has(el.hostId) && !set.has(el.id)) items.push(el);
    this.clipboard = { items: structuredClone(items), levelId: this.activeLevelId(), viewId: this.activeViewId };
    if (cut) {
      this.commit('Recortar', () => deleteElements(this.doc, ids));
      this.select([]);
    }
    this.setPrompt(`${cut ? 'Recortado' : 'Copiado'} ${items.length} elemento${items.length === 1 ? '' : 's'}. Colar coloca-os na mesma posição no pavimento ativo.`);
    this.ribbon.refresh();
  }

  paste() {
    const cb = this.clipboard;
    if (!cb) return;
    const levelId = this.activeLevelId();
    const targetView = this.activeViewId;
    const ids = [];
    this.commit('Colar', () => {
      const map = new Map();
      for (const it of cb.items) {
        if (it.hostId && cb.items.some((x) => x.id === it.hostId)) continue;
        if (it.hostId && !this.doc.has(it.hostId)) continue;
        const { id, ...rest } = it;
        const patch = {};
        if (rest.levelId && levelId) patch.levelId = levelId;
        if (rest.viewId) patch.viewId = targetView;
        if (rest.topLevelId && rest.levelId !== levelId) {
          const above = this.doc.levelAbove(levelId);
          patch.topLevelId = above?.id ?? null;
        }
        const n = this.doc.add({ ...rest, ...patch });
        map.set(id, n.id);
        ids.push(n.id);
      }
      for (const it of cb.items) {
        if (!it.hostId || !map.has(it.hostId)) continue;
        const { id: _id, ...rest } = it;
        void _id;
        const n = this.doc.add({ ...rest, hostId: map.get(it.hostId) });
        ids.push(n.id);
      }
    });
    this.select(ids);
    this.setPrompt(`${ids.length} elemento${ids.length === 1 ? '' : 's'} colado${ids.length === 1 ? '' : 's'}. Use Mover (MV) para posicioná-los.`);
  }

  // Keyboard ----------------------------------------------------------------------------------

  bindKeys() {
    document.addEventListener('keydown', (e) => this.keydown(e));
  }

  keydown(e) {
    const tgt = e.target;
    const typing = tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement || tgt instanceof HTMLSelectElement || tgt?.isContentEditable;
    if (document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    // Global accelerators work everywhere except in text fields.
    if (mod && !e.altKey) {
      const k = key.toLowerCase();
      const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: e.shiftKey ? 'saveAs' : 'save', o: 'open', n: 'new', p: 'print', k: 'search' };
      if (!typing) Object.assign(map, { c: 'copyClip', x: 'cutClip', v: 'paste', a: 'selectAll' });
      if (k === 'tab') {
        e.preventDefault();
        return this.cycleView(e.shiftKey ? -1 : 1);
      }
      if (map[k] && (!typing || ['s', 'o', 'n', 'p', 'k'].includes(k))) {
        e.preventDefault();
        return this.run(map[k]);
      }
      return;
    }
    if (key === 'F1') {
      e.preventDefault();
      return this.run('help');
    }
    if (typing || !this.doc) return;
    if (tgt?.closest?.('.tree, .rb-tabs, .vtabs, .menu')) {
      if (key !== 'Escape') return;
    }
    if (this.tool?.key?.(e)) return;
    if (key === 'Escape') {
      e.preventDefault();
      this.keyBuffer = '';
      if (this.navMode) return this.setNavMode(null);
      if (this.tool && !(this.tool instanceof SelectTool)) {
        if (this.tool.cancel()) this.cancelTool();
        else this.setPrompt(this.tool.prompt);
        this.requestRender();
        return;
      }
      return;
    }
    if (key === 'Delete' || (key === 'Backspace' && this.selection.size)) {
      e.preventDefault();
      return this.run('delete');
    }
    if (key === 'Enter' && this.lastToolCommand && (!this.tool || this.tool instanceof SelectTool)) {
      e.preventDefault();
      return this.run(this.lastToolCommand);
    }
    // Two-letter shortcuts.
    if (/^[a-z]$/i.test(key) && !e.altKey) {
      this.keyBuffer = (this.keyBuffer + key.toUpperCase()).slice(-2);
      clearTimeout(this.keyTimer);
      this.keyTimer = setTimeout(() => (this.keyBuffer = ''), 1500);
      this.setPrompt(`Atalho: ${this.keyBuffer}`);
      if (this.keyBuffer.length === 2) {
        const name = Object.keys(COMMANDS).find((n) => COMMANDS[n].keys === this.keyBuffer);
        this.keyBuffer = '';
        if (name) {
          e.preventDefault();
          return this.run(name);
        }
        this.setPrompt('Nenhum comando tem esse atalho. Pressione F1 para a lista.');
      }
    }
  }

  // Panels ----------------------------------------------------------------------------------------

  renderBrowser() {
    this.browser?.render();
    const t = this.shell?.root.querySelector('#browser-title');
    if (t) t.textContent = this.doc ? `Navegador de Projeto - ${this.file?.name || this.doc.project.name}` : 'Navegador de Projeto';
  }

  updateTitle() {
    const t = this.shell.title;
    clear(t);
    if (!this.doc) {
      t.append(h('span.title-name', 'BIMDesign'));
      document.title = 'BIMDesign';
      return;
    }
    const name = this.file?.name || this.doc.project.name || 'Sem título';
    t.append(h('span.title-name', name));
    if (this.doc.modified) t.append(h('span.title-dot', { 'aria-label': 'Alterações não salvas', role: 'img' }));
    const v = this.activeView;
    if (v) t.append(h('span.title-view', `- ${this.viewName(v)}`));
    document.title = `${this.doc.modified ? '* ' : ''}${name} - BIMDesign`;
    this.shell.undoBtn.disabled = !this.doc.canUndo;
    this.shell.redoBtn.disabled = !this.doc.canRedo;
  }

  bindDock() {
    const s = this.settings.dockState;
    if (s) {
      this.shell.dock.classList.toggle('props-hidden', s.props === false);
      this.shell.dock.classList.toggle('browser-hidden', s.browser === false);
      this.shell.main.classList.toggle('dock-hidden', !!s.hidden);
    }
    const w = this.settings.dockWidth;
    if (w) this.shell.root.style.setProperty('--dock-w', `${w}px`);
    const ph = this.settings.propsHeight;
    if (ph) this.shell.dock.style.setProperty('--props-h', `${ph}%`);
    const drag = (el, onMove, onEnd) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const move = (ev) => onMove(ev);
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          onEnd?.();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    };
    drag(
      this.shell.dockResize,
      (ev) => {
        const r = this.shell.main.getBoundingClientRect();
        const w2 = Math.max(200, Math.min(560, ev.clientX - r.left));
        this.shell.root.style.setProperty('--dock-w', `${w2}px`);
        this.shell.dockResize.setAttribute('aria-valuenow', String(Math.round(w2)));
        this.dockW = w2;
      },
      () => this.dockW && this.settingsStore.set('dockWidth', this.dockW),
    );
    drag(
      this.shell.dockSplit,
      (ev) => {
        const r = this.shell.dock.getBoundingClientRect();
        const p = Math.max(15, Math.min(85, ((ev.clientY - r.top) / r.height) * 100));
        this.shell.dock.style.setProperty('--props-h', `${p}%`);
        this.shell.dockSplit.setAttribute('aria-valuenow', String(Math.round(p)));
        this.propsH = p;
      },
      () => this.propsH && this.settingsStore.set('propsHeight', this.propsH),
    );
    const keyResize = (el, prop, step, min, max, unit, save) =>
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        e.stopPropagation();
        const target = prop === '--dock-w' ? this.shell.root : this.shell.dock;
        const cur = parseFloat(getComputedStyle(target).getPropertyValue(prop)) || (prop === '--dock-w' ? 290 : 52);
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -step : step;
        const v = Math.max(min, Math.min(max, cur + d));
        target.style.setProperty(prop, `${v}${unit}`);
        el.setAttribute('aria-valuenow', String(Math.round(v)));
        this.settingsStore.set(save, v);
      });
    keyResize(this.shell.dockResize, '--dock-w', 16, 200, 560, 'px', 'dockWidth');
    keyResize(this.shell.dockSplit, '--props-h', 4, 15, 85, '%', 'propsHeight');
  }

  buildPhonebar() {
    this.renderPhonebar();
  }

  renderPhonebar() {
    const bar = this.shell.phonebar;
    clear(bar);
    const dock = this.shell.dock;
    const btn = (label, ic, action, pressed) => h('button.pb-btn', { type: 'button', 'aria-pressed': pressed == null ? null : String(pressed), onClick: action }, icon(ic, 20), h('span', label));
    bar.append(
      btn('Ferramentas', 'wall', () => dialogs.toolsSheet(this)),
      btn('Vistas', 'layers', () => this.togglePane('browser'), dock.classList.contains('phone-browser') && dock.classList.contains('phone-open')),
      btn('Propriedades', 'sliders', () => this.togglePane('props'), dock.classList.contains('phone-props') && dock.classList.contains('phone-open')),
      btn('Desfazer', 'undo', () => this.run('undo')),
      btn('Modificar', 'modify', () => dialogs.modifySheet(this)),
    );
  }

  // Selection overlay (temporary dimensions and room reference) -----------------------------------------

  drawSelectionOverlay(ctx, vc, vp) {
    this.tempDims = [];
    if (!vc?.is2D || this.selection.size !== 1 || !(this.tool instanceof SelectTool) || this.tool.drag?.started) return;
    const el = this.doc.get([...this.selection][0]);
    if (!el || el.pinned) return;
    for (const d of temporaryDimensions(this.doc, el)) {
      const rect = drawTempDim(ctx, vc.modelToScreen(d.a), vc.modelToScreen(d.b), formatLength(d.value, this.doc.units), vp.theme.selCss, vp.theme, d.offsetPx ?? 18);
      if (rect) this.tempDims.push({ ...d, rect });
    }
  }

  /** A click on a temporary dimension's value opens it for editing. */
  tempDimAt(x, y) {
    return (this.tempDims || []).find((d) => x >= d.rect.x && x <= d.rect.x + d.rect.w && y >= d.rect.y && y <= d.rect.y + d.rect.h) ?? null;
  }

  editTempDim(d, ev) {
    this.tool.openInput(ev.x, ev.y, {
      label: 'Distância',
      value: formatLength(d.value, this.doc.units),
      onSubmit: (v) => {
        const mm = parseLength(v, this.doc.units);
        if (!Number.isFinite(mm) || mm < 0) return false;
        this.commit('Editar cota', () => d.apply(this.doc, mm));
        return true;
      },
    });
  }

  // Theme ----------------------------------------------------------------------------------------

  get themePref() {
    return this.settings.theme || 'system';
  }

  applyTheme() {
    const t = this.themePref;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('bd.theme', t);
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => this.viewport?.readTheme());
  }

  setTheme(value) {
    this.settingsStore.set('theme', value || 'system');
    this.applyTheme();
    this.ribbon?.refresh();
  }

  themeMenu(anchor) {
    const cur = this.themePref;
    showMenu(
      anchor,
      [
        { label: 'Sistema', icon: 'monitor', checked: cur === 'system', radio: true, action: () => this.setTheme('system') },
        { label: 'Claro', icon: 'sun-l', checked: cur === 'light', radio: true, action: () => this.setTheme('light') },
        { label: 'Escuro', icon: 'moon', checked: cur === 'dark', radio: true, action: () => this.setTheme('dark') },
      ],
      { label: 'Tema' },
    );
  }

  // Menus -------------------------------------------------------------------------------------------

  appMenu(anchor) {
    showMenu(
      anchor,
      [
        { label: 'Novo Projeto...', icon: 'file-plus', shortcut: `${MOD}+N`, action: () => this.run('new') },
        { label: 'Abrir...', icon: 'folder-open', shortcut: `${MOD}+O`, action: () => this.run('open') },
        { separator: true },
        { label: 'Salvar', icon: 'save', shortcut: `${MOD}+S`, action: () => this.run('save') },
        { label: 'Salvar Como...', icon: 'save-all', action: () => this.run('saveAs') },
        { label: 'Exportar...', icon: 'download', action: () => this.run('export') },
        { label: 'Imprimir ou Exportar PDF...', icon: 'printer', shortcut: `${MOD}+P`, action: () => this.run('print') },
        { separator: true },
        { label: 'Informações do Projeto...', icon: 'info', action: () => this.run('projectInfo') },
        { separator: true },
        { label: 'Início', icon: 'house', action: () => this.showHome() },
        { label: 'Atalhos de Teclado', icon: 'keyboard', action: () => this.run('shortcuts') },
        { label: 'Sobre o BIMDesign', icon: 'info', action: () => this.run('about') },
      ].filter(Boolean),
      { label: 'Arquivo', className: 'app-menu' },
    );
  }

  commandPalette() {
    dialogs.commandPalette(this);
  }

  // Home --------------------------------------------------------------------------------------------

  showHome(keepDoc = false) {
    void keepDoc;
    this.viewport.setController(null);
    this.shell.viewcube.hidden = true;
    this.shell.nav.hidden = true;
    this.shell.domView.hidden = false;
    this.activeHome = true;
    renderHome(this, this.shell.domView);
    if (!this.doc) {
      clear(this.shell.vtabs);
      this.updateTitle();
    }
  }

  newProject(system) {
    const doc = createProject({ system });
    this.setDoc(doc, null);
    this.toast(`Novo projeto ${system === 'imperial' ? 'imperial' : 'métrico'}. Comece com Parede (WA) na aba Arquitetura.`);
  }

  openSample() {
    const doc = createSampleProject({ system: this.settings.units === 'imperial' ? 'imperial' : 'metric' });
    this.setDoc(doc, null);
  }

  /** Starts a new or sample project after offering to save unsaved changes. */
  async startProject(kind) {
    if (!(await files.confirmDiscard(this))) return false;
    if (kind === 'sample') this.openSample();
    else this.newProject(kind);
    return true;
  }

  // Files and dialogs (implemented in io/files.js and ui/dialogs.js) ------------------------------------

  newProjectDialog() {
    return dialogs.newProjectDialog(this);
  }
  openDialog() {
    return files.openDialog(this);
  }
  save() {
    return files.save(this);
  }
  saveAs() {
    return files.saveAs(this);
  }
  exportDialog(format) {
    return dialogs.exportDialog(this, format);
  }
  editTypeDialog(type) {
    const t = type || this.doc.get(this.doc.get([...this.selection][0])?.typeId) || (this.tool?.placingKind ? this.currentType(this.tool.placingKind) : null);
    if (!t) return this.toast('Selecione um elemento com tipo, ou escolha um tipo no Navegador de Projeto.', { kind: 'error' });
    return dialogs.typeDialog(this, t);
  }
  visibilityDialog() {
    return dialogs.visibilityDialog(this);
  }
  projectInfoDialog() {
    return dialogs.projectInfoDialog(this);
  }
  unitsDialog() {
    return dialogs.unitsDialog(this);
  }
  materialsDialog() {
    return dialogs.materialsDialog(this);
  }
  levelsDialog() {
    return dialogs.levelsDialog(this);
  }
  typesDialog() {
    return dialogs.typesDialog(this);
  }
  snapsDialog() {
    return dialogs.snapsDialog(this);
  }
  purgeDialog() {
    return dialogs.purgeDialog(this);
  }
  shortcutsDialog() {
    return dialogs.shortcutsDialog(this);
  }
  helpDialog() {
    return dialogs.helpDialog(this);
  }
  aboutDialog() {
    return dialogs.aboutDialog(this);
  }
  planViewDialog() {
    return dialogs.planViewDialog(this);
  }
  newScheduleDialog(category) {
    return dialogs.newScheduleDialog(this, category);
  }
  newSheet() {
    return dialogs.newSheet(this);
  }
  placeViewDialog(viewId) {
    return dialogs.placeViewDialog(this, viewId);
  }
  exportSchedule(id) {
    return files.exportScheduleCSV(this, id);
  }
  importDXF() {
    return files.importDXF(this);
  }
  scheduleFieldsDialog(id) {
    return dialogs.scheduleFieldsDialog(this, id);
  }
}
