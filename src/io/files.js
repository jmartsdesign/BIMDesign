/** Opening, saving and recovering local project files. */
import { toast, unsavedDialog, promptDialog } from '../ui/dialog.js';
import { encodeProject, decodeProject, baseName, safeFileName, NATIVE_EXT } from './native.js';
import {
  deviceOpen,
  deviceSave,
  download,
  recovery,
  acquireSessionLock,
} from './storage.js';
import { scheduleRows, scheduleColumns, toCSV } from '../core/schedule.js';

// Recovery ---------------------------------------------------------------------------------

let recoveryTimer = 0;
let ownsSession = null;

export function scheduleRecovery(app) {
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => writeRecovery(app), 1200);
}

async function writeRecovery(app) {
  if (!app.doc) return;
  if (ownsSession === null) ownsSession = await acquireSessionLock();
  if (!ownsSession) return;
  try {
    const blob = await encodeProject(app.doc);
    const data = await blob.arrayBuffer();
    const meta = app.file ? { name: app.file.name, path: app.file.path || null, source: app.file.source } : null;
    await recovery.put({ id: app.docId, data, file: meta, modified: app.doc.modified, savedAt: Date.now(), name: app.file?.name || app.doc.project.name });
    await recovery.setSession({ docId: app.docId, views: app.openViews, active: app.activeViewId });
  } catch (err) {
    console.warn('Recovery copy failed', err);
  }
}

/** Restore the last session in this browser. Returns true when a project was restored. */
export async function recover(app) {
  ownsSession = await acquireSessionLock();
  if (!ownsSession) return false;
  const session = await recovery.getSession();
  if (!session?.docId) return false;
  const rec = await recovery.get(session.docId);
  if (!rec?.data) return false;
  try {
    const doc = await decodeProject(rec.data);
    if (rec.modified) doc.savedRevision = -1;
    const file = rec.file?.source === 'device'
      ? { name: rec.file.name, source: 'device', recoveryId: rec.id }
      : { recoveryId: rec.id, name: rec.file?.name || rec.name, source: 'local' };
    app.setDoc(doc, file);
    for (const id of session.views || []) if (doc.has(id)) app.openView(id);
    if (session.active && doc.has(session.active)) app.activateView(session.active);
    return true;
  } catch (err) {
    console.warn('Could not restore the last session', err);
    return false;
  }
}

// Opening ------------------------------------------------------------------------------------

export async function confirmDiscard(app) {
  if (!app.doc?.modified) return true;
  // Projects kept only in this browser are safe in the recovery store, but ask anyway.
  const r = await unsavedDialog(app.file?.name || app.doc.project.name || 'Untitled');
  if (r === 'save') return (await save(app)) !== false;
  return r === 'discard';
}

async function loadBuffer(app, buffer, file) {
  try {
    const doc = await decodeProject(buffer);
    await recovery.delete(app.docId);
    app.setDoc(doc, file);
    toast(`Aberto ${file?.name || 'projeto'}.`, { kind: 'success' });
    return true;
  } catch (err) {
    toast(err.message || 'Este arquivo não pôde ser aberto.', { kind: 'error' });
    return false;
  }
}

export async function openDevice(app) {
  if (!(await confirmDiscard(app))) return;
  const f = await deviceOpen();
  if (!f) return;
  await loadBuffer(app, f.buffer, { name: baseName(f.name), handle: f.handle || null, source: 'device' });
}

export async function openDialog(app) {
  return openDevice(app);
}

// Saving --------------------------------------------------------------------------------------

export async function save(app) {
  if (!app.doc) return false;
  const f = app.file;
  if (f?.source === 'device' && f.handle) return writeDevice(app, f.name, f.handle);
  return saveAs(app);
}

async function writeDevice(app, name, handle) {
  const doc = app.doc;
  const rev = doc.revision;
  const blob = await encodeProject(doc);
  const r = await deviceSave(blob, `${safeFileName(name)}${NATIVE_EXT}`, handle);
  if (!r) return false;
  doc.markSaved(rev);
  if (doc !== app.doc) return true;
  app.file = { ...app.file, name: baseName(r.name), handle: r.handle || null, source: 'device' };
  app.updateTitle();
  scheduleRecovery(app);
  toast(r.downloaded ? `Baixado ${r.name}.` : `Salvo ${r.name}.`, { kind: 'success' });
  return true;
}

export async function saveAs(app) {
  if (!app.doc) return false;
  const name0 = app.file?.name || app.doc.project.name || 'Sem título';
  const name = await promptDialog('Salvar projeto neste dispositivo', 'Nome do projeto', name0, { okLabel: 'Salvar', validate: (v) => (!v.trim() ? 'Digite um nome.' : null) });
  if (!name) return false;
  return writeDevice(app, safeFileName(name), null);
}

// Import ---------------------------------------------------------------------------------------

/** Pick a local file; resolves to a File or null. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Import a DXF drawing into the active view as detail lines and text. */
export async function importDXF(app) {
  const view = app.activeView;
  if (!view || !['plan', 'ceilingPlan', 'elevation', 'section', 'sheet'].includes(view.kind)) {
    if (!app.requirePlan()) return;
  }
  const target = app.activeView;
  const file = await pickFile('.dxf');
  if (!file) return;
  const { parseDXF } = await import('./dxf.js');
  let parsed;
  try {
    parsed = parseDXF(await file.text(), app.doc.units.system === 'imperial' ? 25.4 : 1);
  } catch (err) {
    return toast(`Não foi possível ler o arquivo DXF: ${err.message || err}`, { kind: 'error' });
  }
  const { lines, texts } = parsed;
  if (!lines.length && !texts.length) return toast('O arquivo não tem linhas nem textos no model space.', { kind: 'error' });
  const scale = target.kind === 'sheet' ? 1 : +target.scale || 100;
  const ids = [];
  app.commit('Importar DXF', () => {
    for (const [a, b] of lines) ids.push(app.doc.add({ kind: 'detailLine', viewId: target.id, a, b, style: 'thin' }).id);
    for (const t of texts) ids.push(app.doc.add({ kind: 'text', viewId: target.id, at: t.at, text: t.text, size: Math.max(1, Math.round((t.height / scale) * 10) / 10 || 2.5), rotation: t.rotation, align: 'left' }).id);
  });
  app.select(ids);
  app.vc?.zoomExtents?.(true, new Set(ids));
  toast(`Importadas ${lines.length} linhas e ${texts.length} textos em ${target.name}. Elas estão selecionadas: mova-as para o lugar com Mover (MV).`);
}

// Exports --------------------------------------------------------------------------------------

export function exportScheduleCSV(app, id) {
  const view = app.doc.get(id);
  if (!view || view.kind !== 'schedule') return;
  const cols = scheduleColumns(app.doc, view);
  const rows = scheduleRows(app, view);
  const csv = toCSV(cols, rows, app.doc.units);
  download(new Blob([csv], { type: 'text/csv' }), `${safeFileName(view.name)}.csv`);
}
