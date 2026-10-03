import { describe, expect, it } from 'vitest';
import portraits from '../art/portraits/portraits.json';
import { WALLS_IMAGE_SIZE, wallCrop, BOARD_GRID_X, BOARD_GRID_Y, PORTRAIT_IDS, boardTileRect, boardTileSprite, defaultFacing, mirrorPortrait, parsePortraitRef, portraitFacing, portraitSprite, portraitUrl } from '../src/rendering/art';
import { basePack } from './helpers';

// The prototype art is cropped from art/references/ at draw time (1254×1254 sheets).
// The avatar PNGs, inlined as data URLs so their headers can be read.
const PNGS = import.meta.glob('../art/portraits/*.png', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;
const pngSize = (dataUrl: string) => {
  const bytes = atob(dataUrl.split(',')[1].slice(0, 44));
  const u32 = (o: number) => ((bytes.charCodeAt(o) << 24) | (bytes.charCodeAt(o + 1) << 16) | (bytes.charCodeAt(o + 2) << 8) | bytes.charCodeAt(o + 3)) >>> 0;
  return [u32(16), u32(20)];
};
const SHEET = 1254;

describe('prototype art mapping', () => {
  it('parses content portrait refs: avatar ids, plus legacy "monsters:<n>"', () => {
    expect(parsePortraitRef('eye')).toBe('eye');
    expect(parsePortraitRef('frost-wraith')).toBe('frost-wraith');
    expect(parsePortraitRef('monsters:0')).toBe('eye');
    expect(parsePortraitRef('monsters:3')).toBe('hood');
    for (const bad of [undefined, '', 'monsters:16', 'monsters:x', 'nobody', 'EYE']) expect(parsePortraitRef(bad)).toBeNull();
  });

  it('48 avatars (3 sheets): unique ids, a square crop inside its sheet and an exactly 256×256 PNG each', () => {
    expect(PORTRAIT_IDS).toHaveLength(48);
    expect(new Set(PORTRAIT_IDS).size).toBe(48);
    for (const p of portraits.portraits) {
      const [x, y, w, h] = p.crop;
      expect(w).toBe(h);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(SHEET);
      expect(y + h).toBeLessThanOrEqual(SHEET);
      // PNG IHDR: width and height are big-endian at bytes 16 and 20.
      expect(pngSize(PNGS[`../art/portraits/${p.id}.png`])).toEqual([256, 256]);
      expect(portraitUrl(p.id)).toMatch(/.png/);
    }
  });

  it('every avatar knows which way it looks in its picture', () => {
    for (const id of PORTRAIT_IDS) expect(['left', 'right', 'front']).toContain(portraitFacing(id));
    expect(portraitFacing('werewolf')).toBe('right');
    expect(portraitFacing('dragon')).toBe('left');
    expect(portraitFacing('eye')).toBe('front');
    expect([portraitFacing('moss-wolf'), portraitFacing('carrion-crow'), portraitFacing('toadstool')]).toEqual(['right', 'left', 'front']);
    expect(portraitFacing('monsters:2')).toBe('left'); // legacy ref -> dragon
    expect(portraitFacing('nobody')).toBeNull();
  });

  it('P1 looks right and P2 left by default; avatars are mirrored only when they look the other way', () => {
    expect([defaultFacing('P1'), defaultFacing('P2')]).toEqual(['right', 'left']);
    // A right-looking picture: mirrored for P2, not for P1.
    expect([mirrorPortrait('werewolf', 'right'), mirrorPortrait('werewolf', 'left')]).toEqual([false, true]);
    // A left-looking picture: mirrored for P1, not for P2.
    expect([mirrorPortrait('dragon', 'right'), mirrorPortrait('dragon', 'left')]).toEqual([true, false]);
    // Front-facing pictures are never mirrored.
    expect([mirrorPortrait('eye', 'right'), mirrorPortrait('eye', 'left')]).toEqual([false, false]);
    expect(mirrorPortrait(undefined, 'left')).toBe(false);
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
    expect(byId).toEqual({ glubber: 'eye', shroud: 'hood' });
    for (const ref of Object.values(byId)) expect(parsePortraitRef(ref)).not.toBeNull();
  });

  it('without loaded art (tests, failed load) the renderers fall back to the procedural look', () => {
    expect(portraitSprite('eye')).toBeNull();
    expect(boardTileSprite(0, 0, 'board')).toBeNull();
  });

  it('every arena wall shape has a crop inside the walls reference, sized by its cells', () => {
    const shapes = [['single', 1, 1, 1], ['horizontal', 2, 2, 1], ['horizontal', 3, 3, 1], ['vertical', 2, 1, 2], ['vertical', 3, 1, 3]] as const;
    for (const [o, n, cols, rows] of shapes) {
      const c = wallCrop(o, n);
      expect(c.sx).toBeGreaterThanOrEqual(0);
      expect(c.sy).toBeGreaterThanOrEqual(0);
      expect(c.sx + c.sw).toBeLessThanOrEqual(WALLS_IMAGE_SIZE.w);
      expect(c.sy + c.sh).toBeLessThanOrEqual(WALLS_IMAGE_SIZE.h);
      // About 60.5 px per cell in the reference.
      expect(Math.abs(c.sw / cols - 60.5)).toBeLessThan(1.5);
      expect(Math.abs(c.sh / rows - 60.5)).toBeLessThan(1.5);
    }
  });
});
