/** User settings stay on this device and are loaded from localStorage. */
const LOCAL_KEY = 'bd.settings';

export const DEFAULTS = {
  theme: 'system',
  thinLines: false,
  units: null,
  snaps: { enabled: true, endpoints: true, midpoints: true, intersections: true, perpendicular: true, nearest: true, angles: true, lengths: true, alignment: true, tolPx: 12 },
  snapLabels: true,
  wheelZoomOnly: false,
  dockState: null,
  dockWidth: null,
  propsHeight: null,
};

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = merge(base[k], v);
    else out[k] = v;
  }
  return out;
}

export class Settings {
  constructor() {
    this.saved = {};
    this.values = merge(DEFAULTS, {});
  }

  load() {
    try {
      this.saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {};
    } catch {
      this.saved = {};
    }
    // The theme is also read before first paint (index.html).
    try {
      const t = localStorage.getItem('bd.theme');
      if (t && !this.saved.theme) this.saved.theme = t;
    } catch {
      /* ignore */
    }
    this.values = merge(DEFAULTS, this.saved);
  }

  set(key, value) {
    this.saved[key] = value;
    this.values = merge(DEFAULTS, this.saved);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(this.saved));
    } catch {
      /* ignore quota */
    }
  }
}
