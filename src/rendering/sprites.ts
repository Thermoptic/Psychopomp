// Placeholder creature art: a symmetric pixel monster generated from the
// creature's content id (so every new creature gets its own look with no art
// files). This is presentation only — it never touches the game RNG.
// Real artwork from content `art` fields will replace this later.

import type { PlayerId } from '../core/types';
import type { Ctx } from './draw';
import { C, playerColor, playerDark } from './theme';

const SIZE = 10;
const cache = new Map<string, number[][]>();

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 0 = empty, 1 = body, 2 = shade, 3 = eye */
function pattern(id: string): number[][] {
  const cached = cache.get(id);
  if (cached) return cached;
  let s = hash(id);
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) / 16777216;
  };
  const half = SIZE / 2;
  const grid: number[][] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: number[] = new Array(SIZE).fill(0);
    for (let x = 0; x < half; x++) {
      // Denser towards the centre so it reads as one creature.
      const centre = 1 - Math.abs(x - half + 0.5) / half;
      const vert = y === 0 || y === SIZE - 1 ? 0.35 : 1;
      const on = rnd() < (0.25 + centre * 0.6) * vert;
      const v = on ? (rnd() < 0.25 ? 2 : 1) : 0;
      row[x] = v;
      row[SIZE - 1 - x] = v;
    }
    grid.push(row);
  }
  // Solid core and eyes.
  for (let y = 3; y < 7; y++) grid[y][half - 1] = grid[y][half] = 1;
  const eyeY = 3 + Math.floor(rnd() * 2);
  grid[eyeY][half - 2] = grid[eyeY][half + 1] = 3;
  cache.set(id, grid);
  return grid;
}

/** Draws the creature centred at (cx, cy); `px` is the size of one art pixel. */
export function drawCreature(ctx: Ctx, defId: string, owner: PlayerId, cx: number, cy: number, px: number, opts: { flip?: boolean; flash?: string } = {}): void {
  const grid = pattern(defId);
  const x0 = Math.round(cx - (SIZE * px) / 2);
  const y0 = Math.round(cy - (SIZE * px) / 2);
  const body = opts.flash ?? playerColor(owner);
  const shade = opts.flash ?? playerDark(owner);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = grid[y][opts.flip ? SIZE - 1 - x : x];
      if (!v) continue;
      ctx.fillStyle = v === 1 ? body : v === 2 ? shade : opts.flash ? C.edgeDark : '#fff6d8';
      ctx.fillRect(x0 + x * px, y0 + y * px, px, px);
    }
  }
  // 1px dark outline feel: darken the bottom row edge.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x0, y0 + SIZE * px - px, SIZE * px, px);
}
