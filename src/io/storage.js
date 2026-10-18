/** Device files and local recovery copies. Project files are always on-device. */

const EXT_LABEL = { '.bdp': 'Projeto de edificação', '.ifc': 'Modelo IFC', '.obj': 'Malha OBJ', '.dxf': 'Desenho DXF', '.svg': 'Imagem SVG', '.pdf': 'Documento PDF', '.png': 'Imagem PNG', '.csv': 'Tabela CSV', '.glb': 'Binário glTF' };

const FS_ACCESS = typeof window !== 'undefined' && 'showOpenFilePicker' in window && window.self === window.top;

export async function deviceOpen() {
  if (FS_ACCESS) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Projetos de edificação', accept: { 'application/octet-stream': ['.bdp'] } }],
        excludeAcceptAllOption: false,
      });
      const file = await handle.getFile();
      return { name: file.name, handle, buffer: await file.arrayBuffer() };
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      // Fall through to the input element (for example in cross-origin frames).
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bdp';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.arrayBuffer().then(
        (buffer) => resolve({ name: file.name, buffer }),
        (err) => reject(err),
      );
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Save to a device file. Returns { name, handle } when written, { name,
 * downloaded: true } when the browser can only download it, or null when
 * the user cancelled.
 */
export async function deviceSave(blob, name, handle) {
  if (handle && FS_ACCESS) {
    try {
      // Handles kept from an earlier visit need permission again.
      if (handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Permission denied');
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return { name: handle.name, handle };
    } catch (err) {
      if (err?.name === 'AbortError') return null;
    }
  }
  if (FS_ACCESS) {
    try {
      const ext = name.slice(name.lastIndexOf('.'));
      const h = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: EXT_LABEL[ext] || 'Arquivo', accept: { 'application/octet-stream': [ext] } }],
      });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return { name: h.name, handle: h };
    } catch (err) {
      if (err?.name === 'AbortError') return null;
    }
  }
  download(blob, name);
  return { name, downloaded: true };
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Local recovery (IndexedDB) ----------------------------------------------------

const DB_NAME = 'building-design';
const DB_VERSION = 1;
let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => resolve(r?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const recovery = {
  /** Store a record; resolves false when storage is unavailable or full. */
  async put(record) {
    try {
      await tx('docs', 'readwrite', (s) => s.put(record));
      return true;
    } catch {
      return false;
    }
  },
  async get(id) {
    try {
      return await tx('docs', 'readonly', (s) => s.get(id));
    } catch {
      return null;
    }
  },
  async delete(id) {
    try {
      await tx('docs', 'readwrite', (s) => s.delete(id));
    } catch {
      /* ignore */
    }
  },
  async all() {
    try {
      return (await tx('docs', 'readonly', (s) => s.getAll())) || [];
    } catch {
      return [];
    }
  },
  async setSession(value) {
    try {
      await tx('meta', 'readwrite', (s) => s.put(value, 'session'));
    } catch {
      /* ignore */
    }
  },
  async getSession() {
    try {
      return await tx('meta', 'readonly', (s) => s.get('session'));
    } catch {
      return null;
    }
  },
};

/**
 * Claim the recovery session for this tab. Resolves true when this tab owns
 * it (the lock is held until the tab closes), false when another tab does.
 */
export function acquireSessionLock() {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks
      .request('building-design-session', { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return new Promise(() => {});
      })
      .catch(() => resolve(true));
  });
}
