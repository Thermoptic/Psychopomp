import { describe, expect, it } from 'vitest';
import { BOARD_GRID_X, BOARD_GRID_Y, MONSTER_SHEET, boardTileRect, boardTileSprite, parsePortraitRef, portraitRect, portraitSprite } from '../src/rendering/art';
import { basePack } from './helpers';

// The prototype art is cropped from art/references/ at draw time (1254×1254 sheets).
const SHEET = 1254;

describe('prototype art mapping', () => {
  it('parses content portrait refs ("monsters:<n>")', () => {
    expect(parsePortraitRef('monsters:0')).toEqual({ sheet: 'monsters', index: 0 });
    expect(parsePortraitRef('monsters:15')).toEqual({ sheet: 'monsters', index: 15 });
    for (const bad of [undefined, '', 'monsters:16', 'monsters:-1', 'monster:1', 'monsters:1x', 'board:0']) expect(parsePortraitRef(bad)).toBeNull();
  });

  it('every portrait crop is a square inside the monster sheet', () => {
    expect(MONSTER_SHEET).toHaveLength(16);
    for (let i = 0; i < 16; i++) {
      const r = portraitRect(i);
      expect(r.sw).toBe(r.sh);
      expect(r.sx).toBeGreaterThanOrEqual(0);
      expect(r.sy).toBeGreaterThanOrEqual(0);
      expect(r.sx + r.sw).toBeLessThanOrEqual(SHEET);
      expect(r.sy + r.sh).toBeLessThanOrEqual(SHEET);
    }
  });

  it('the 9×9 board tiles are inside the board art and do not overlap', () => {
    expect(BOARD_GRID_X).toHaveLength(10);
    expect(BOARD_GRID_Y).toHaveLength(10);
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const r = boardTileRect(x, y);
        expect(r.sw).toBeGreaterThan(100);
        expect(r.sh).toBeGreaterThan(100);
        expect(r.sx + r.sw).toBeLessThanOrEqual(SHEET);
        expect(r.sy + r.sh).toBeLessThanOrEqual(SHEET);
        if (x < 8) expect(r.sx + r.sw).toBeLessThan(boardTileRect(x + 1, y).sx);
        if (y < 8) expect(r.sy + r.sh).toBeLessThan(boardTileRect(x, y + 1).sy);
      }
    }
  });

  it('the bundled creatures point at their prototype portraits', () => {
    const byId = Object.fromEntries(basePack().creatures.map((c) => [c.id, c.art.portrait]));
    expect(byId).toEqual({ glubber: 'monsters:0', shroud: 'monsters:3' });
    for (const ref of Object.values(byId)) expect(parsePortraitRef(ref)).not.toBeNull();
  });

  it('without loaded art (tests, failed load) the renderers fall back to the procedural look', () => {
    expect(portraitSprite('monsters:0')).toBeNull();
    expect(boardTileSprite(0, 0, 'board')).toBeNull();
  });
});
