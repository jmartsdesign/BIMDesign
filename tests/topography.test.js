import { describe, expect, it } from 'vitest';
import {
  delaunay,
  parseTopographyText,
  terrainCutFill,
  terrainFaces,
  terrainHeightAt,
  withTerrainModifier,
} from '../src/core/topography.js';
import { build3D } from '../src/core/build3d.js';
import { planGraphics } from '../src/core/plan.js';

function projectedArea(faces) {
  return faces.reduce((sum, face) => {
    let twiceArea = 0;
    for (let i = 0; i < face.length; i++) twiceArea += face[i][0] * face[(i + 1) % face.length][1] - face[(i + 1) % face.length][0] * face[i][1];
    return sum + Math.abs(twiceArea) / 2;
  }, 0);
}

describe('topography core', () => {
  it('detects XYZ columns, units and contour identifiers', () => {
    const parsed = parseTopographyText('Linha;X;Y;Cota\nA;0;0;1\nA;1;0;1\nA;1;1;1\nB;0;0;2', 1000);
    expect(parsed.points).toEqual([[0, 0, 1000], [1000, 0, 1000], [1000, 1000, 1000], [0, 0, 2000]]);
    expect(parsed.contours).toHaveLength(1);
    expect(parsed.contours[0]).toEqual({ elevation: 1000, points: [[0, 0], [1000, 0], [1000, 1000]] });
  });

  it('maps Delaunay indices back to the original samples when XY duplicates exist', () => {
    const points = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 500]];
    const triangles = delaunay(points);
    expect(triangles).toHaveLength(1);
    expect(triangles[0]).toEqual([0, 1, 2]);
  });

  it('clips terrain faces to boundaries and holes without losing interpolated heights', () => {
    const terrain = {
      points: [[0, 0, 0], [10, 0, 10], [0, 10, 10]],
      boundary: [[0, 0], [10, 0], [0, 10]],
      holes: [[[1, 1], [3, 1], [1, 3]]],
    };
    expect(projectedArea(terrainFaces(terrain))).toBeCloseTo(48);
    expect(terrainHeightAt(terrain, 1.5, 1.5)).toBeNull();
    expect(terrainHeightAt(terrain, 2, 1)).toBeCloseTo(3);
  });

  it('subtracts and unions structure footprints as geometric surface modifiers', () => {
    const terrain = {
      points: [[0, 0, 0], [10, 0, 0], [0, 10, 0]],
      boundary: [[0, 0], [10, 0], [0, 10]],
    };
    const footprint = [[1, 1], [3, 1], [1, 3]];
    const doc = { get: () => ({ elevation: 0 }) };
    const floor = { id: 'f1', kind: 'floor', levelId: 'l1', boundary: footprint };
    const cut = { ...terrain, ...withTerrainModifier(doc, terrain, floor, 'subtract') };
    expect(projectedArea(terrainFaces(cut))).toBeCloseTo(48);
    const fill = { ...terrain, ...withTerrainModifier(doc, terrain, floor, 'union'), modifiers: [{ operation: 'union', polygon: footprint, elevation: 5 }] };
    expect(terrainHeightAt(fill, 1.5, 1.5)).toBeCloseTo(5);
    expect(terrainHeightAt(fill, 4, 1)).toBeCloseTo(0);
  });

  it('calculates cut and fill volumes between existing and proposed surfaces', () => {
    const existing = { points: [[0, 0, 10], [10, 0, 10], [0, 10, 10]], boundary: [[0, 0], [10, 0], [0, 10]] };
    const proposed = { points: [[0, 0, 8], [10, 0, 8], [0, 10, 8]], boundary: existing.boundary };
    expect(terrainCutFill(existing, proposed)).toEqual({ cut: 100, fill: 0, net: -100 });
  });

  it('limits cut and fill to the overlapping area of differently bounded terrains', () => {
    const existing = {
      points: [[0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]],
      boundary: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };
    const proposed = {
      points: [[5, 0, 8], [15, 0, 8], [15, 10, 8], [5, 10, 8]],
      boundary: [[5, 0], [15, 0], [15, 10], [5, 10]],
    };
    expect(terrainCutFill(existing, proposed)).toEqual({ cut: 100, fill: 0, net: -100 });
  });

  it('builds a 3D mesh and plan graphics for a terrain in a site plan', () => {
    const terrain = {
      id: 'terrain',
      kind: 'topography',
      levelId: 'level-1',
      points: [[0, 0, 0], [1000, 0, 500], [1000, 1000, 1000], [0, 1000, 500]],
      boundary: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]],
      contourInterval: 250,
      baseElevation: -1000,
    };
    const mesh = build3D({ doc: {}, material: () => null }, terrain);
    expect(mesh.pos.length).toBeGreaterThan(0);
    const graphics = planGraphics({ view: { kind: 'plan', sitePlan: true, levelId: 'another-level' } }, terrain);
    expect(graphics.lines.length).toBeGreaterThan(4);
    expect(graphics.picks).toHaveLength(1);
  });
});
