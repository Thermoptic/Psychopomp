import { describe, expect, it } from 'vitest';
import manifest from '../art/environment/environment.json';
import { cropPlacement, lightPositions, type EnvCrop } from '../src/rendering/environment';
import { BOARD_AREA, HEADER, LEFT_PANEL, MESSAGE_BAR, RIGHT_PANEL, SIDE_MARGIN } from '../src/rendering/layout';
import { VIEW_H, VIEW_W } from '../src/rendering/theme';

// Environment crops come from art/references/psychopomp-environment-reference.webp (1565×1005).
const REF = { w: 1565, h: 1005 };
const crops = manifest.crops as EnvCrop[];

describe('environment layer', () => {
  it('every crop lies inside the reference image', () => {
    for (const c of crops) {
      const [x, y, w, h] = c.src;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(REF.w);
      expect(y + h).toBeLessThanOrEqual(REF.h);
    }
  });

  it('crops are placed against their edge of the view and stay inside it', () => {
    for (const c of crops) {
      const r = cropPlacement(c);
      expect(r.x).toBeGreaterThanOrEqual(-0.01);
      expect(r.y).toBeGreaterThanOrEqual(-0.01);
      expect(r.x + r.w).toBeLessThanOrEqual(VIEW_W + 0.01);
      expect(r.y + r.h).toBeLessThanOrEqual(VIEW_H + 0.01);
    }
    expect(cropPlacement(crops.find((c) => c.anchor === 'left')!).x).toBe(0);
    expect(cropPlacement(crops.find((c) => c.anchor === 'bottom')!).y + cropPlacement(crops.find((c) => c.anchor === 'bottom')!).h).toBeCloseTo(VIEW_H);
  });

  it('every fire light maps into the view', () => {
    const lights = lightPositions();
    expect(lights).toHaveLength(manifest.lights.length);
    for (const l of lights) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThanOrEqual(VIEW_W);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(VIEW_H);
    }
  });

  it('the match layout leaves room for the environment around the mounted UI', () => {
    expect(LEFT_PANEL.x).toBe(SIDE_MARGIN);
    expect(RIGHT_PANEL.x + RIGHT_PANEL.w).toBe(VIEW_W - SIDE_MARGIN);
    // Title plaque and message bar sit in the board's column.
    for (const r of [HEADER, MESSAGE_BAR]) {
      expect(r.x).toBe(BOARD_AREA.x);
      expect(r.w).toBe(BOARD_AREA.w);
    }
    // The board keeps its size (9 cells of 43 px + frame).
    expect(BOARD_AREA.w).toBe(408);
    expect(MESSAGE_BAR.y + MESSAGE_BAR.h).toBeLessThan(VIEW_H);
  });
});
