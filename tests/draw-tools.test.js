import { describe, it, expect, vi } from 'vitest';
import { WallTool } from '../src/editor/draw.js';

describe('wall tool', () => {
  it('ends a chained line sequence on double-click', () => {
    const app = { cancelTool: vi.fn() };
    const tool = Object.create(WallTool.prototype);
    tool.app = app;
    tool.o = { shape: 'line', chain: true };
    tool.start = [100, 200];

    tool.dblclick();

    expect(tool.start).toBeNull();
    expect(app.cancelTool).toHaveBeenCalledOnce();
  });

  it('does not stop a non-sequenced or non-line wall tool on double-click', () => {
    const app = { cancelTool: vi.fn() };
    const tool = Object.create(WallTool.prototype);
    tool.app = app;
    tool.o = { shape: 'rect', chain: true };
    tool.start = [100, 200];

    tool.dblclick();

    expect(tool.start).toEqual([100, 200]);
    expect(app.cancelTool).not.toHaveBeenCalled();

    tool.o = { shape: 'line', chain: false };
    tool.dblclick();
    expect(tool.start).toEqual([100, 200]);
    expect(app.cancelTool).not.toHaveBeenCalled();
  });
});
