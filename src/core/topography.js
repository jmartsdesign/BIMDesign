import { pointInPolygon, signedArea } from './geom.js';
import { add, scale, norm, perp, rotate } from './geom.js';
import { levelElevation, verticalExtent } from './model.js';
import earcut from '../vendor/earcut.js';

const terrainFaceCache = new WeakMap();
const HEADER = {
  x: ['x', 'este', 'easting', 'coordx', 'xcoord'],
  y: ['y', 'norte', 'northing', 'coordy', 'ycoord'],
  z: ['z', 'cota', 'elevacao', 'elevation', 'altitude', 'nivel'],
};

function normalizedHeader(s) {
  return String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function numberValue(s, decimalComma = false) {
  let v = String(s ?? '').trim().replace(/\s/g, '');
  if (decimalComma && v.includes(',')) v = v.replace(',', '.');
  else if (v.includes(',') && !v.includes('.')) v = v.replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function delimiterFor(lines) {
  const sample = lines.find((l) => l.trim() && !l.trim().startsWith('#')) || '';
  const candidates = [';', '\t', ',', '|'];
  const delimiter = candidates.sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  return sample.split(delimiter).length > 1 ? delimiter : null;
}

/** Parse XYZ point rows from delimited text, with or without a header row. */
export function parseTopographyText(text, scale = 1) {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('A escala de importação deve ser maior que zero.');
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) throw new Error('O ficheiro não contém pontos de topografia.');
  const delimiter = delimiterFor(lines);
  const decimalComma = delimiter !== ',';
  const rows = lines.map((line) => (delimiter ? line.split(delimiter) : line.trim().split(/\s+/)).map((v) => v.trim()));
  let cols = null;
  let groupCol = -1;
  const header = rows[0].map(normalizedHeader);
  const findCol = (names) => header.findIndex((v) => names.includes(v));
  const xCol = findCol(HEADER.x);
  const yCol = findCol(HEADER.y);
  const zCol = findCol(HEADER.z);
  let start = 0;
  if (xCol >= 0 && yCol >= 0 && zCol >= 0) {
    cols = [xCol, yCol, zCol];
    groupCol = header.findIndex((v) => ['linha', 'curva', 'contour', 'line', 'codigo', 'code', 'lineid', 'contourid', 'idlinha', 'idcurva', 'nomecurva'].includes(v));
    start = 1;
  } else {
    const first = rows[0];
    if (first.length < 3 || first.slice(0, 3).some((x) => numberValue(x, decimalComma) == null)) start = 1;
    cols = [0, 1, 2];
  }
  const points = [];
  const groups = new Map();
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const x = numberValue(row[cols[0]], decimalComma);
    const y = numberValue(row[cols[1]], decimalComma);
    const z = numberValue(row[cols[2]], decimalComma);
    if (x == null || y == null || z == null) continue;
    const p = { x: x * scale, y: y * scale, z: z * scale };
    points.push([p.x, p.y, p.z]);
    const key = groupCol >= 0 && row[groupCol] ? `${row[groupCol]}|${p.z}` : `z:${p.z}`;
    if (!groups.has(key)) groups.set(key, { elevation: p.z, points: [] });
    groups.get(key).points.push([p.x, p.y]);
  }
  if (points.length < 3) throw new Error(`São necessários pelo menos 3 pontos XYZ válidos; foram encontrados ${points.length}.`);
  if (points.length > 5000) throw new Error('O ficheiro contém mais de 5.000 pontos. Reduza a amostragem antes de importar.');
  const contours = groupCol >= 0 ? [...groups.values()].filter((g) => g.points.length >= 2) : [];
  return { points, contours };
}

/** Delaunay triangulation of [x, y, z] samples using Bowyer-Watson. */
export function delaunay(points) {
  if (points.length < 3) return [];
  const unique = [];
  const sourceIndices = [];
  const seen = new Set();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const k = `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
    sourceIndices.push(i);
  }
  if (unique.length < 3) return [];
  const n = unique.length;
  const xs = unique.map((p) => p[0]);
  const ys = unique.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const all = [...unique, [cx - 32 * span, cy - span, 0], [cx, cy + 32 * span, 0], [cx + 32 * span, cy - span, 0]];
  let triangles = [[n, n + 1, n + 2]];
  for (let pi = 0; pi < n; pi++) {
    const bad = [];
    for (let ti = 0; ti < triangles.length; ti++) if (inCircumcircle(all[pi], ...triangles[ti].map((i) => all[i]))) bad.push(ti);
    const edges = new Map();
    for (const ti of bad) {
      const t = triangles[ti];
      for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const e = edges.get(key);
        if (e) e.count++;
        else edges.set(key, { a, b, count: 1 });
      }
    }
    const badSet = new Set(bad);
    triangles = triangles.filter((_, i) => !badSet.has(i));
    for (const e of edges.values()) if (e.count === 1) {
      let t = [e.a, e.b, pi];
      if (orient(...t.map((i) => all[i])) < 0) t = [e.b, e.a, pi];
      triangles.push(t);
    }
  }
  return triangles
    .filter((t) => t.every((i) => i < n) && Math.abs(orient(...t.map((i) => all[i]))) > 1e-8)
    .map((t) => t.map((i) => sourceIndices[i]));
}

function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function inCircumcircle(p, a, b, c) {
  const ax = a[0] - p[0];
  const ay = a[1] - p[1];
  const bx = b[0] - p[0];
  const by = b[1] - p[1];
  const cx = c[0] - p[0];
  const cy = c[1] - p[1];
  const det = (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
  return orient(a, b, c) > 0 ? det > 1e-8 : det < -1e-8;
}

export function terrainTriangles(terrain) {
  const points = terrain.points || [];
  const tris = delaunay(points);
  const boundary = terrain.boundary || [];
  const holes = terrain.holes || [];
  const modifiers = terrain.modifiers || [];
  return tris.filter((t) => {
    const a = points[t[0]];
    const b = points[t[1]];
    const c = points[t[2]];
    const center = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    if (boundary.length >= 3 && !pointInPolygon(center, boundary)) return false;
    if (holes.some((h) => pointInPolygon(center, h))) return false;
    for (const m of modifiers) {
      if (m.operation === 'subtract' && m.polygon?.length >= 3 && pointInPolygon(center, m.polygon)) return false;
    }
    return true;
  });
}

function polygonTriangles(poly) {
  if (!poly || poly.length < 3) return [];
  const flat = poly.flatMap((p) => [p[0], p[1]]);
  const indices = earcut(flat);
  const out = [];
  for (let i = 0; i < indices.length; i += 3) out.push([poly[indices[i]], poly[indices[i + 1]], poly[indices[i + 2]]]);
  return out;
}

function splitPolygon(poly, a, b) {
  const inside = [];
  const outside = [];
  const signed = (p) => orient(a, b, p);
  const addUnique = (arr, p) => {
    if (!arr.length || Math.hypot(arr.at(-1)[0] - p[0], arr.at(-1)[1] - p[1]) > 1e-7) arr.push(p);
  };
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = signed(p);
    const dq = signed(q);
    if (dp >= -1e-8) addUnique(inside, p);
    else addUnique(outside, p);
    if ((dp < -1e-8 && dq > 1e-8) || (dp > 1e-8 && dq < -1e-8)) {
      const t = dp / (dp - dq);
      const hit = p.map((v, k) => v + (q[k] - v) * t);
      addUnique(inside, hit);
      addUnique(outside, hit);
    }
  }
  if (inside.length > 2 && Math.hypot(inside[0][0] - inside.at(-1)[0], inside[0][1] - inside.at(-1)[1]) < 1e-7) inside.pop();
  if (outside.length > 2 && Math.hypot(outside[0][0] - outside.at(-1)[0], outside[0][1] - outside.at(-1)[1]) < 1e-7) outside.pop();
  return { inside, outside };
}

function intersectConvex(subject, clip) {
  let inside = subject;
  const ccw = signedArea(clip) >= 0 ? clip : clip.slice().reverse();
  for (let i = 0; i < ccw.length && inside.length >= 3; i++) inside = splitPolygon(inside, ccw[i], ccw[(i + 1) % ccw.length]).inside;
  return inside.length >= 3 ? [inside] : [];
}

function subtractConvex(subject, clip) {
  let inside = subject;
  const outside = [];
  const ccw = signedArea(clip) >= 0 ? clip : clip.slice().reverse();
  for (let i = 0; i < ccw.length && inside.length >= 3; i++) {
    const split = splitPolygon(inside, ccw[i], ccw[(i + 1) % ccw.length]);
    if (split.outside.length >= 3) outside.push(split.outside);
    inside = split.inside;
  }
  return outside;
}

function subtractPolygon(face, polygon, polygonParts = polygonTriangles(polygon)) {
  let pieces = [face];
  for (const triangle of polygonParts) pieces = pieces.flatMap((piece) => subtractConvex(piece, triangle));
  return pieces;
}

function indexFaces(faces) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const face of faces) for (const p of face) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  const size = Math.max(1, Math.max(maxX - minX, maxY - minY) / Math.max(1, Math.sqrt(faces.length)));
  const grid = new Map();
  const oversized = [];
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const xs = face.map((p) => p[0]);
    const ys = face.map((p) => p[1]);
    const x0 = Math.floor((Math.min(...xs) - minX) / size);
    const x1 = Math.floor((Math.max(...xs) - minX) / size);
    const y0 = Math.floor((Math.min(...ys) - minY) / size);
    const y1 = Math.floor((Math.max(...ys) - minY) / size);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) {
      oversized.push(i);
      continue;
    }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = `${x},${y}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
  }
  return { faces, grid, oversized, minX, minY, size };
}

function faceCandidates(index, face) {
  const x0 = Math.floor((Math.min(...face.map((p) => p[0])) - index.minX) / index.size);
  const x1 = Math.floor((Math.max(...face.map((p) => p[0])) - index.minX) / index.size);
  const y0 = Math.floor((Math.min(...face.map((p) => p[1])) - index.minY) / index.size);
  const y1 = Math.floor((Math.max(...face.map((p) => p[1])) - index.minY) / index.size);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return index.faces.map((_, i) => i);
  const found = new Set(index.oversized);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
    for (const i of index.grid.get(`${x},${y}`) || []) found.add(i);
  return [...found];
}

function faceTriangles(faces) {
  return faces.flatMap((face) => Array.from({ length: Math.max(0, face.length - 2) }, (_, i) => [face[0], face[i + 1], face[i + 2]]));
}

function heightOnTriangle(tri, x, y) {
  const [a, b, c] = tri;
  const den = orient(a, b, c);
  if (Math.abs(den) < 1e-10) return null;
  const u = orient([x, y], b, c) / den;
  const v = orient(a, [x, y], c) / den;
  const w = 1 - u - v;
  return u * a[2] + v * b[2] + w * c[2];
}

function clipByValue(poly, keepPositive) {
  const out = [];
  const value = (p) => p[3];
  const keep = (p) => keepPositive ? value(p) >= -1e-8 : value(p) <= 1e-8;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = value(p);
    const dq = value(q);
    if (keep(p)) out.push(p);
    if ((dp < -1e-8 && dq > 1e-8) || (dp > 1e-8 && dq < -1e-8)) {
      const t = dp / (dp - dq);
      out.push(p.map((v, k) => v + (q[k] - v) * t));
    }
  }
  return out.length >= 3 ? out : [];
}

function integratedDifference(poly) {
  let volume = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const tri = [poly[0], poly[i], poly[i + 1]];
    volume += Math.abs(orient(tri[0], tri[1], tri[2])) * (tri[0][3] + tri[1][3] + tri[2][3]) / 6;
  }
  return volume;
}

/** Triangulated terrain faces after exact polygon clipping and surface modifiers. */
export function terrainFaces(terrain) {
  if (terrain && typeof terrain === 'object' && terrainFaceCache.has(terrain)) return terrainFaceCache.get(terrain).faces;
  const points = terrain.points || [];
  const boundary = terrain.boundary || [];
  const holes = terrain.holes || [];
  const modifiers = terrain.modifiers || [];
  const boundaryParts = polygonTriangles(boundary);
  let faces = [];
  for (const t of delaunay(points)) {
    const tri = t.map((i) => points[i]);
    const clipped = boundary.length >= 3 ? boundaryParts.flatMap((b) => intersectConvex(tri, b)) : [tri];
    faces.push(...clipped);
  }
  for (const hole of holes) {
    const parts = polygonTriangles(hole);
    faces = faces.flatMap((face) => subtractPolygon(face, hole, parts));
  }
  for (const modifier of modifiers) {
    if (modifier.polygon?.length < 3) continue;
    const polygonParts = polygonTriangles(modifier.polygon);
    if (modifier.operation === 'subtract') {
      faces = faces.flatMap((face) => subtractPolygon(face, modifier.polygon, polygonParts));
    } else if (modifier.operation === 'union' && Number.isFinite(+modifier.elevation)) {
      const next = [];
      for (const face of faces) {
        const inside = polygonParts.flatMap((tri) => intersectConvex(face, tri));
        next.push(...subtractPolygon(face, modifier.polygon, polygonParts));
        for (const poly of inside) {
          const heights = poly.map((p) => p[2]);
          if (Math.max(...heights) <= +modifier.elevation + 1e-8) {
            next.push(poly.map((p) => [p[0], p[1], +modifier.elevation]));
            continue;
          }
          if (Math.min(...heights) >= +modifier.elevation - 1e-8) {
            next.push(poly);
            continue;
          }
          const tagged = poly.map((p) => [p[0], p[1], p[2], p[2] - +modifier.elevation]);
          const above = clipByValue(tagged, true);
          const below = clipByValue(tagged, false);
          if (above.length >= 3) next.push(above.map((p) => [p[0], p[1], p[2]]));
          if (below.length >= 3) next.push(below.map((p) => [p[0], p[1], +modifier.elevation]));
        }
      }
      faces = next;
    }
  }
  const valid = faces.filter((face) => face.length >= 3 && Math.abs(face.reduce((s, p, i) => s + p[0] * face[(i + 1) % face.length][1] - face[(i + 1) % face.length][0] * p[1], 0)) > 1e-7);
  if (terrain && typeof terrain === 'object') terrainFaceCache.set(terrain, indexFaces(valid));
  return valid;
}

/** Plan footprint and top elevation for supported structural elements. */
export function structureFootprint(doc, el) {
  const type = doc.get(el.typeId) || {};
  if (['floor', 'ceiling', 'roof'].includes(el.kind) && el.boundary?.length >= 3) {
    const thickness = +type.thickness || type.layers?.reduce((sum, layer) => sum + (+layer.thickness || 0), 0) || 0;
    const z = levelElevation(doc, el.levelId) + (+el.offset || 0) + (el.kind === 'floor' ? thickness : 0);
    return { polygon: el.boundary, elevation: z };
  }
  if (el.kind === 'wall') {
    const d = norm([el.b[0] - el.a[0], el.b[1] - el.a[1]]);
    const n = perp(d);
    const half = (+type.thickness || type.layers?.reduce((s, l) => s + (+l.thickness || 0), 0) || 200) / 2;
    const { top } = verticalExtent(doc, el);
    return { polygon: [add(el.a, scale(n, half)), add(el.b, scale(n, half)), add(el.b, scale(n, -half)), add(el.a, scale(n, -half))], elevation: top };
  }
  if (el.kind === 'beam') {
    const d = norm([el.b[0] - el.a[0], el.b[1] - el.a[1]]);
    const n = perp(d);
    const half = (+type.width || 300) / 2;
    const top = levelElevation(doc, el.levelId) + (+el.offset || 0);
    return { polygon: [add(el.a, scale(n, half)), add(el.b, scale(n, half)), add(el.b, scale(n, -half)), add(el.a, scale(n, -half))], elevation: top };
  }
  if (el.kind === 'column' || el.kind === 'component') {
    const at = el.at;
    const width = +type.width || 450;
    const depth = +type.depth || width;
    const points = type.shape === 'round' && el.kind === 'column'
      ? Array.from({ length: 32 }, (_, i) => {
          const a = (i / 32) * Math.PI * 2;
          return [at[0] + Math.cos(a) * width / 2, at[1] + Math.sin(a) * width / 2];
        })
      : [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map((p) => add(at, rotate(p, (+el.rotation || 0) * Math.PI / 180)));
    const top = el.kind === 'component'
      ? levelElevation(doc, el.levelId) + (+el.offset || 0) + (+type.height || 0)
      : verticalExtent(doc, el).top;
    return { polygon: points, elevation: top };
  }
  if (el.kind === 'stair' || el.kind === 'ramp') {
    const width = +el.width || 1100;
    const d = norm([el.b[0] - el.a[0], el.b[1] - el.a[1]]);
    const n = perp(d);
    const polygon = [add(el.a, scale(n, width / 2)), add(el.b, scale(n, width / 2)), add(el.b, scale(n, -width / 2)), add(el.a, scale(n, -width / 2))];
    const top = el.topLevelId ? levelElevation(doc, el.topLevelId) + (+el.topOffset || 0) : levelElevation(doc, el.levelId) + (+el.height || 1000);
    return { polygon, elevation: top };
  }
  return null;
}

export function withTerrainModifier(doc, terrain, structure, operation) {
  if (!['union', 'subtract'].includes(operation)) throw new Error('Operação topográfica inválida.');
  const modifiers = [...(terrain.modifiers || [])].filter((m) => m.structureId !== structure.id);
  const footprint = structureFootprint(doc, structure);
  if (!footprint || footprint.polygon.length < 3) throw new Error('Este elemento não tem uma pegada válida para modificar o terreno.');
  modifiers.push({ structureId: structure.id, operation, polygon: footprint.polygon.map((p) => [...p]), elevation: footprint.elevation });
  return { modifiers };
}

/** Intersections of a terrain triangulation with a horizontal elevation. */
export function terrainContourSegments(terrain, elevation) {
  const out = [];
  for (const face of terrainFaces(terrain)) for (let index = 1; index + 1 < face.length; index++) {
    const t = [face[0], face[index], face[index + 1]];
    const hits = [];
    for (let i = 0; i < 3; i++) {
      const a = t[i];
      const b = t[(i + 1) % 3];
      const da = a[2] - elevation;
      const db = b[2] - elevation;
      if (Math.abs(da) < 1e-8 && Math.abs(db) < 1e-8) continue;
      if (da === 0) hits.push([a[0], a[1]]);
      else if (db === 0) hits.push([b[0], b[1]]);
      else if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const f = da / (da - db);
        hits.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    const unique = hits.filter((p, i) => hits.findIndex((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-4) === i);
    if (unique.length === 2) out.push(unique);
  }
  return out;
}

/** Interpolate the surface height at a point covered by the triangulated terrain. */
export function terrainHeightAt(terrain, x, y) {
  const faces = terrainFaces(terrain);
  const index = terrainFaceCache.get(terrain);
  if (!index) return null;
  const cellX = Math.floor((x - index.minX) / index.size);
  const cellY = Math.floor((y - index.minY) / index.size);
  const candidateIds = [...(index.grid.get(`${cellX},${cellY}`) || []), ...index.oversized];
  for (const faceId of candidateIds) {
    const face = faces[faceId];
    for (let faceIndex = 1; faceIndex + 1 < face.length; faceIndex++) {
    const [a, b, c] = [face[0], face[faceIndex], face[faceIndex + 1]];
    const den = orient(a, b, c);
    if (Math.abs(den) < 1e-10) continue;
    const u = orient([x, y], b, c) / den;
    const v = orient(a, [x, y], c) / den;
    const w = 1 - u - v;
    if (u >= -1e-8 && v >= -1e-8 && w >= -1e-8) return u * a[2] + v * b[2] + w * c[2];
    }
  }
  return null;
}

/** Signed areas for terrain volume comparison against a design surface. */
export function terrainCutFill(existing, proposed) {
  const existingTriangles = faceTriangles(terrainFaces(existing));
  const proposedTriangles = faceTriangles(terrainFaces(proposed));
  if (!existingTriangles.length || !proposedTriangles.length) return { cut: 0, fill: 0, net: 0 };
  const existingIndex = indexFaces(existingTriangles);
  let cut = 0;
  let fill = 0;
  for (const proposedTri of proposedTriangles) {
    for (const id of faceCandidates(existingIndex, proposedTri)) {
      const existingTri = existingTriangles[id];
      const overlap = intersectConvex(proposedTri, existingTri);
      for (const poly of overlap) {
        const values = poly.map((p) => {
          const z = heightOnTriangle(existingTri, p[0], p[1]);
          return [p[0], p[1], p[2], z - p[2]];
        });
        cut += integratedDifference(clipByValue(values, true));
        fill -= integratedDifference(clipByValue(values, false));
      }
    }
  }
  return { cut, fill, net: fill - cut };
}

export function terrainBoundary(terrain) {
  if (terrain.boundary?.length >= 3) return terrain.boundary;
  const pts = terrain.points || [];
  if (pts.length < 3) return [];
  const unique = new Map();
  for (const p of pts) {
    const key = `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
    if (!unique.has(key)) unique.set(key, p);
  }
  const sorted = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (arr) => {
    const out = [];
    for (const p of arr) {
      while (out.length >= 2 && orient(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  const hull = [...half(sorted).slice(0, -1), ...half(sorted.slice().reverse()).slice(0, -1)];
  return signedArea(hull) < 0 ? hull.reverse() : hull;
}
