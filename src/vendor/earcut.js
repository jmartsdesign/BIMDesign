/**
 * earcut — polygon triangulation (vendored, MIT license, by Mapbox).
 * https://github.com/mapbox/earcut
 *
 * Eliminates the npm dependency so the app runs without a bundler.
 *
 * @param {number[]} data - flat array of vertex coordinates [x0,y0,x1,y1,...]
 * @param {number[]} [holeIndices] - start indices of each hole ring
 * @param {number} [dim=2] - coordinates per vertex
 * @returns {number[]} triangle vertex indices (3 per triangle)
 */
export default function earcut(data, holeIndices, dim) {
  dim = dim || 2;
  const hasHoles = holeIndices && holeIndices.length > 0;
  const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles = [];
  if (!outerNode || outerNode.next === outerNode.prev) return triangles;

  let minX, minY, invSize;
  if (hasHoles) {
    outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
  }

  // Bounding box for the z-order optimization (skip for small polygons)
  if (data.length > 80 * dim) {
    minX = minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (let i = dim; i < outerLen; i += dim) {
      const x = data[i], y = data[i + 1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }

  earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);
  return triangles;
}

// --- node pool (simplified: just use plain objects) ---

function linkedList(data, start, end, dim, clockwise) {
  let i, last;
  if (clockwise === (signedArea(data, start, end, dim) > 0)) {
    for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
  } else {
    for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
  }
  if (last && equals(last, last.next)) {
    removeNode(last);
    last = last.next;
  }
  return last;
}

function insertNode(i, x, y, last) {
  const p = new Node(i, x, y);
  if (!last) {
    p.prev = p;
    p.next = p;
  } else {
    p.next = last.next;
    p.prev = last;
    last.next.prev = p;
    last.next = p;
  }
  return p;
}

class Node {
  constructor(i, x, y) {
    this.i = i;
    this.x = x;
    this.y = y;
    this.prev = null;
    this.next = null;
    this.steiner = false;
  }
}

function removeNode(p) {
  p.next.prev = p.prev;
  p.prev.next = p.next;
}

function filterPoints(start, end) {
  if (!start) return start;
  if (!end) end = start;
  let p = start;
  let again;
  do {
    again = false;
    if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
      removeNode(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else {
      p = p.next;
    }
  } while (again || p !== end);
  return end;
}

function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
  if (!ear) return;
  let stop = ear, prev, next;

  while (ear.prev !== ear.next) {
    prev = ear.prev;
    next = ear.next;

    if (isEar(ear)) {
      triangles.push(prev.i / dim | 0, ear.i / dim | 0, next.i / dim | 0);
      removeNode(ear);
      ear = next.next;
      stop = next.next;
      continue;
    }

    ear = next;
    if (ear === stop) {
      if (pass === 0) earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);
      else if (pass === 1) earcutLinked(cureLocalIntersections(filterPoints(ear), triangles, dim), triangles, dim, minX, minY, invSize, 2);
      else if (pass === 2) splitEarcut(ear, triangles, dim, minX, minY, invSize);
      break;
    }
  }
}

function isEar(ear) {
  const a = ear.prev, b = ear, c = ear.next;
  if (area(a, b, c) >= 0) return false; // reflex vertex

  // Check that no other vertex is inside triangle abc
  let p = b.next.next;
  while (p !== a) {
    if (pointInTriangle(p.x, p.y, a.x, a.y, b.x, b.y, c.x, c.y) && area(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}

function cureLocalIntersections(start, triangles, dim) {
  let p = start;
  do {
    const a = p.prev, b = p.next.next;
    if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
      triangles.push(a.i / dim | 0, p.i / dim | 0, b.i / dim | 0);
      removeNode(p);
      removeNode(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return filterPoints(p);
}

function splitEarcut(start, triangles, dim, minX, minY, invSize) {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && isValidDiagonal(a, b)) {
        let c = splitPolygon(a, b);
        a = filterPoints(a, a.next);
        c = filterPoints(c, c.next);
        earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
        earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}

function eliminateHoles(data, holeIndices, outerNode, dim) {
  const queue = [];
  for (let i = 0; i < holeIndices.length; i++) {
    const start = holeIndices[i] * dim;
    const end = i < holeIndices.length - 1 ? holeIndices[i + 1] * dim : data.length;
    const list = linkedList(data, start, end, dim, false);
    if (list === list.next) list.steiner = true;
    queue.push(getLeftmost(list));
  }
  queue.sort((a, b) => a.x - b.x);
  for (let i = 0; i < queue.length; i++) outerNode = eliminateHole(queue[i], outerNode);
  return outerNode;
}

function eliminateHole(hole, outerNode) {
  const bridge = findHoleBridge(hole, outerNode);
  if (!bridge) return outerNode;
  const bridgeReverse = splitPolygon(bridge, hole);
  filterPoints(bridgeReverse, bridgeReverse.next);
  return filterPoints(bridge, bridge.next);
}

function findHoleBridge(hole, outerNode) {
  let p = outerNode;
  const hx = hole.x, hy = hole.y;
  let qx = -Infinity, m;

  // Find a segment intersecting the horizontal ray from the hole
  do {
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x;
        m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m; // hole touches the outer polygon
      }
    }
    p = p.next;
  } while (p !== outerNode);

  if (!m) return null;

  // Look for a point inside the triangle formed by hole, m, and the next vertex
  const stop = m;
  const mx = m.x, my = m.y;
  let tanMin = Infinity, tan;

  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x &&
        pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      tan = Math.abs(hy - p.y) / (hx - p.x);
      if ((tan < tanMin || (tan === tanMin && p.x > m.x)) && locallyInside(p, m)) {
        m = p;
        tanMin = tan;
      }
    }
    p = p.next;
  } while (p !== stop);

  return m;
}

function getLeftmost(list) {
  let p = list, leftmost = list;
  do {
    if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
    p = p.next;
  } while (p !== list);
  return leftmost;
}

function signedArea(data, start, end, dim) {
  let sum = 0, j = end - dim;
  for (let i = start; i < end; i += dim) {
    sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
    j = i;
  }
  return sum;
}

function equals(p1, p2) {
  return p1.x === p2.x && p1.y === p2.y;
}

function area(p, q, r) {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

function intersects(p1, q1, p2, q2) {
  if (equals(p1, q1) || equals(p2, q2)) return false;
  return (area(p1, q1, p2) > 0) !== (area(p1, q1, q2) > 0) &&
         (area(p2, q2, p1) > 0) !== (area(p2, q2, q1) > 0);
}

function locallyInside(a, b) {
  return area(a.prev, a, a.next) < 0
    ? area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0
    : area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

function isValidDiagonal(a, b) {
  return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
         ((locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b)) ||
          (equals(a, b) && area(a.prev, a, b.next) > 0 && area(b.prev, b, a.next) > 0));
}

function intersectsPolygon(a, b) {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && intersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}

function middleInside(a, b) {
  let p = a, inside = false;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  do {
    if (((p.y > my) !== (p.next.y > my)) && p.next.y !== p.y &&
        p.x < (p.next.x - p.x) * (my - p.y) / (p.next.y - p.y) + p.x) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}

function splitPolygon(a, b) {
  const a2 = new Node(a.i, a.x, a.y);
  const b2 = new Node(b.i, b.x, b.y);
  const an = a.next, bp = b.prev;
  a.next = b; b.prev = a;
  a2.next = an; an.prev = a2;
  b2.next = a2; a2.prev = b2;
  bp.next = b2; b2.prev = bp;
  return b2;
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
         (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
         (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
