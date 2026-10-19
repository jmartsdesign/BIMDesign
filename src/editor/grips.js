/**
 * Grips (direct manipulation handles) of selected elements. Each grip has a
 * position in the view's coordinates, a shape, and either a drag handler
 * (called inside a live transaction with the snapped pointer point) or a
 * click handler.
 */
import { add, sub, scale, perp, mid, dot, eq, dist } from '../core/geom.js';
import { wallAxis, openingSize } from '../core/model.js';
import { sectionFrame } from '../core/plan.js';
import { dimensionGeometry } from '../core/plan.js';

/** Walls whose ends coincide with point p (other than `except`). */
function wallsEndingAt(doc, p, except) {
  const out = [];
  for (const w of doc.all('wall')) {
    if (w.id === except) continue;
    if (eq(w.a, p, 1)) out.push({ id: w.id, end: 'a' });
    else if (eq(w.b, p, 1)) out.push({ id: w.id, end: 'b' });
  }
  return out;
}

export function gripsFor(app, el, vc) {
  const doc = app.doc;
  const out = [];
  if (!el) return out;
  if (vc.is2D) {
    switch (el.kind) {
      case 'wall': {
        for (const end of ['a', 'b']) {
          const joined = wallsEndingAt(doc, el[end], el.id);
          out.push({
            at: el[end],
            shape: 'circle',
            title: 'Arrastar ponta da parede',
            exclude: [el.id, ...joined.map((j) => j.id)],
            drag: (p) => {
              doc.update(el.id, { [end]: p });
              for (const j of joined) doc.update(j.id, { [j.end]: p });
            },
          });
        }
        const ax = wallAxis(doc, el);
        const ext = el.flipped ? -1 : 1;
        out.push({
          at: add(mid(ax.a, ax.b), scale(ax.n, ext * (ax.half + 12 * vc.mmPerPx()))),
          shape: 'flip',
          angle: Math.atan2(ax.n[1], ax.n[0]),
          title: 'Inverter orientação da parede',
          click: () => app.commit('Inverter parede', () => doc.update(el.id, { flipped: !el.flipped })),
        });
        break;
      }
      case 'door':
      case 'window': {
        const host = doc.get(el.hostId);
        if (!host) break;
        const ax = wallAxis(doc, host);
        const c = add(ax.a, scale(ax.dir, el.t));
        const { width } = openingSize(doc, el);
        const face = el.flipFacing ? -1 : 1;
        const off = ax.half + 14 * vc.mmPerPx();
        out.push({
          at: add(c, scale(ax.n, face * (el.kind === 'window' ? -1 : 1) * off)),
          shape: 'flip',
          angle: Math.atan2(ax.n[1], ax.n[0]),
          title: 'Inverter sentido da face',
          click: () => app.commit('Inverter sentido da face', () => doc.update(el.id, { flipFacing: !el.flipFacing })),
        });
        if (el.kind === 'door') {
          out.push({
            at: add(add(c, scale(ax.dir, width / 2 + 14 * vc.mmPerPx())), scale(ax.n, -face * off)),
            shape: 'flip',
            angle: Math.atan2(ax.dir[1], ax.dir[0]),
            title: 'Inverter mão',
            click: () => app.commit('Inverter mão', () => doc.update(el.id, { flipHand: !el.flipHand })),
          });
        }
        break;
      }
      case 'grid':
      case 'detailLine':
      case 'roomSeparator':
      case 'beam':
      case 'stair':
      case 'ramp':
        for (const end of ['a', 'b'])
          out.push({
            at: el[end],
            shape: 'circle',
            title: 'Arrastar ponta',
            exclude: [el.id],
            drag: (p) => doc.update(el.id, { [end]: p }),
          });
        break;
      case 'section': {
        for (const end of ['a', 'b'])
          out.push({
            at: el[end],
            shape: 'circle',
            title: 'Arrastar ponta',
            exclude: [el.id],
            drag: (p) => doc.update(el.id, { [end]: p }),
          });
        const { look } = sectionFrame(el);
        out.push({
          at: add(mid(el.a, el.b), scale(look, 18 * vc.mmPerPx())),
          shape: 'flip',
          angle: Math.atan2(look[1], look[0]),
          title: 'Inverter corte',
          click: () => app.commit('Inverter corte', () => doc.update(el.id, { flip: !el.flip })),
        });
        out.push({
          at: add(mid(el.a, el.b), scale(look, +el.depth || 10000)),
          shape: 'diamond',
          title: 'Arrastar profundidade da vista',
          drag: (p) => doc.update(el.id, { depth: Math.max(100, dot(sub(p, mid(el.a, el.b)), look)) }),
        });
        break;
      }
      case 'floor':
      case 'ceiling':
      case 'roof':
        (el.boundary || []).forEach((v, i) =>
          out.push({
            at: v,
            shape: 'square',
            title: 'Arrastar vértice',
            exclude: [el.id],
            drag: (p) => {
              const b = el.boundary.slice();
              b[i] = p;
              doc.update(el.id, { boundary: b });
            },
          }),
        );
        break;
      case 'topography': {
        const points = el.points || [];
        if (points.length <= 160) points.forEach((v, i) => out.push({
          at: [v[0], v[1]],
          shape: 'square',
          title: 'Arrastar ponto do terreno',
          exclude: [el.id],
          drag: (p) => updateTerrainPoint(doc, el, i, [p[0], p[1], v[2]]),
        }));
        (el.boundary || []).forEach((v, i) => out.push({
          at: v,
          shape: 'diamond',
          title: 'Arrastar limite do terreno',
          exclude: [el.id],
          drag: (p) => {
            const boundary = el.boundary.slice();
            boundary[i] = p;
            doc.update(el.id, { boundary });
          },
        }));
        break;
      }
      case 'railing':
        (el.path || []).forEach((v, i) =>
          out.push({
            at: v,
            shape: 'square',
            title: 'Arrastar vértice',
            exclude: [el.id],
            drag: (p) => {
              const b = el.path.slice();
              b[i] = p;
              doc.update(el.id, { path: b });
            },
          }),
        );
        break;
      case 'room':
        out.push({ at: el.tagAt || el.at, shape: 'diamond', title: 'Mover etiqueta do ambiente', exclude: [el.id], drag: (p) => doc.update(el.id, { tagAt: p }) });
        break;
      case 'dimension': {
        if (!el.refs?.length) break;
        const g = dimensionGeometry(doc, app.scene.walls, el);
        const s0 = Math.min(...g.pos);
        const s1 = Math.max(...g.pos);
        out.push({
          at: g.at((s0 + s1) / 2),
          shape: 'diamond',
          title: 'Mover linha de cota',
          drag: (p) => {
            const n = perp(g.dir);
            const off = dot(sub(p, el.line), n);
            doc.update(el.id, { line: add(el.line, scale(n, off)) });
          },
        });
        break;
      }
      default:
        break;
    }
  } else if (vc.kind === 'elevation' || vc.kind === 'section') {
    if (el.kind === 'level') {
      const range = vc.modelRange?.(vc.frame());
      const u = (vc.frame().u1 ?? range?.u1 ?? 0) + 12 * (+vc.view.scale || 100);
      out.push({
        at: [u, el.elevation],
        shape: 'circle',
        title: 'Arrastar pavimento',
        noSnap: true,
        drag: (p) => doc.update(el.id, { elevation: Math.round(p[1]) }),
      });
    } else if (el.kind === 'detailLine') {
      for (const end of ['a', 'b']) out.push({ at: el[end], shape: 'circle', title: 'Arrastar ponta', drag: (p) => doc.update(el.id, { [end]: p }) });
    } else if (el.kind === 'topography') {
      const frame = vc.frame();
      const points = el.points || [];
      if (points.length <= 160) points.forEach((v, i) => {
        const depth = dot(sub([v[0], v[1]], frame.origin), frame.look);
        out.push({
          at: [dot(sub([v[0], v[1]], frame.origin), frame.right), v[2]],
          shape: 'square',
          title: 'Arrastar cota do ponto',
          exclude: [el.id],
          drag: (p) => updateTerrainPoint(doc, el, i, [
            frame.origin[0] + frame.right[0] * p[0] + frame.look[0] * depth,
            frame.origin[1] + frame.right[1] * p[0] + frame.look[1] * depth,
            p[1],
          ]),
        });
      });
    }
  }
  return out;
}

function updateTerrainPoint(doc, terrain, index, point) {
  const points = terrain.points.map((p) => (p === terrain.points[index] ? point : p));
  const old = terrain.points[index];
  const boundary = terrain.boundary?.map((p) => (dist(p, old) < 0.5 ? point.slice(0, 2) : p));
  const contours = terrain.contours?.map((c) => ({
    ...c,
    points: c.points.map((p) => (dist(p, old) < 0.5 ? point.slice(0, 2) : p)),
  }));
  doc.update(terrain.id, { points, ...(boundary ? { boundary } : {}), ...(contours ? { contours } : {}) });
}
