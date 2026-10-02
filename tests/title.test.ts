import { describe, expect, it } from 'vitest';
import title from '../art/title/title.json';
import { titlePoint } from '../src/rendering/screens';
import { VIEW_H, VIEW_W } from '../src/rendering/theme';

describe('title screen', () => {
  it('the title image covers the whole view', () => {
    const tl = titlePoint(0, 0);
    const br = titlePoint(title.size[0], title.size[1]);
    expect(tl.x).toBe(0);
    expect(tl.y).toBeLessThanOrEqual(0);
    expect(br.x).toBeCloseTo(VIEW_W);
    expect(br.y).toBeGreaterThanOrEqual(VIEW_H);
  });

  it('every flame lies inside the image and is visible on screen', () => {
    expect(title.flames.length).toBeGreaterThan(15);
    for (const f of title.flames) {
      expect(['fire', 'red', 'blue']).toContain(f.kind);
      const p = titlePoint(f.at[0], f.at[1]);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(VIEW_W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(VIEW_H);
    }
  });
});
