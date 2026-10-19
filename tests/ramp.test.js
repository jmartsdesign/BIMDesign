import { describe, it, expect, vi } from 'vitest';
import { project } from './helpers.js';
import { rampExtent } from '../src/core/model.js';
import { Scene } from '../src/core/scene.js';
import { planContext, planGraphics } from '../src/core/plan.js';
import { categoryOf, KIND_LABEL } from '../src/core/catalog.js';
import { instanceParams } from '../src/core/props.js';
import { COMMANDS } from '../src/commands.js';
import { RIBBON } from '../src/ui/ribbon-def.js';
import { writeIFC } from '../src/io/ifc.js';
import { RampTool } from '../src/editor/draw.js';

describe('ramps', () => {
  it('finishes the command from the Concluir button or a double-click', () => {
    const app = { cancelTool: vi.fn() };
    const tool = Object.create(RampTool.prototype);
    tool.app = app;
    tool.start = [100, 200];

    tool.finish();
    expect(tool.start).toBeNull();
    expect(app.cancelTool).toHaveBeenCalledOnce();

    tool.start = [300, 400];
    tool.dblclick();
    expect(tool.start).toBeNull();
    expect(app.cancelTool).toHaveBeenCalledTimes(2);
  });

  it('resolves rise, run and width from level constraints', () => {
    const { doc, L1, L2 } = project();
    const r = { kind: 'ramp', levelId: L1.id, topLevelId: L2.id, a: [0, 0], b: [6000, 0], width: 1200, thickness: 150 };
    const g = rampExtent(doc, r);
    expect(g.base).toBe(L1.elevation);
    expect(g.top).toBe(L2.elevation);
    expect(g.rise).toBe(L2.elevation - L1.elevation);
    expect(g.length).toBe(6000);
    expect(g.width).toBe(1200);
    expect(g.thickness).toBe(150);
  });

  it('builds selectable 3D geometry and plan graphics at both ends', () => {
    const { doc, add, L1, L2 } = project();
    const ramp = add({
      kind: 'ramp',
      levelId: L1.id,
      topLevelId: L2.id,
      a: [0, 0],
      b: [6000, 0],
      width: 1200,
      thickness: 150,
      materialId: 'mat-concrete',
    });
    const scene = new Scene(doc);
    const mesh = scene.mesh(ramp);
    expect(mesh.pos.length).toBeGreaterThan(0);

    for (const level of [L1, L2]) {
      const view = doc.all('plan').find((p) => p.levelId === level.id);
      const pc = planContext(doc, view, scene.walls, scene.rooms);
      const graphics = scene.planOf(view, ramp, pc);
      expect(graphics.lines.length).toBeGreaterThanOrEqual(6);
      expect(graphics.picks).toHaveLength(1);
    }

    expect(categoryOf(ramp, doc)).toBe('ramps');
    expect(KIND_LABEL.ramp).toBe('Rampa');
    expect(instanceParams(ramp).map((p) => p.key)).toContain('slope');
    expect(writeIFC({ doc, scene })).toContain('=IFCRAMP(');
    expect(COMMANDS.ramp.label).toBe('Rampa');
    expect(RIBBON.some((tab) => tab.panels.some((panel) => panel.items.some((item) => item.cmd === 'ramp')))).toBe(true);
    scene.dispose();
  });

  it('renders no plan footprint for a zero-length ramp', () => {
    const { doc, L1, L2 } = project();
    const ramp = { kind: 'ramp', levelId: L1.id, topLevelId: L2.id, a: [0, 0], b: [0, 0], width: 1200 };
    const view = doc.all('plan').find((p) => p.levelId === L1.id);
    const graphics = planGraphics(planContext(doc, view, null, null), ramp);
    expect(graphics).toBeNull();
  });
});
