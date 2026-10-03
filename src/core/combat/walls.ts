// Static walls in the combat arena: a constrained procedural generator.
//
// Each battle gets a few separate obstacles (about 6 segments, 10-12 cells):
// 1×1, 1×2 and 1×3 blocks, horizontal or vertical, lying exactly on arena cells.
// It is not "random x, random y": for every segment all legal placements are
// listed, the ones breaking a hard rule are dropped, the rest are scored
// (spread from the other walls, zone balance, distance from the starts, a
// little noise) and one of the best 20 % is picked at random. A finished
// layout must still let P1 reach P2, otherwise the whole layout is redone.
//
// Hard rules (never broken):
//   - every cell inside the arena;
//   - every cell at Manhattan distance >= START_CLEARANCE from both starts;
//   - cells of two different segments at Chebyshev distance >= SEGMENT_GAP
//     (always at least one free cell between walls, also diagonally).
//
// Pure and deterministic: the same seed always gives the same layout.

import { createRng, nextFloat, nextInt } from '../rng';
import type { Cell, RngState, WallSegment } from '../types';

export interface CombatWallsSetup {
  width: number;
  height: number;
  player1Start: Cell;
  player2Start: Cell;
  seed: number;
}

/** Minimum Manhattan distance from a start position to any wall cell. */
export const START_CLEARANCE = 4;
/** Minimum Chebyshev distance between cells of two different wall segments. */
export const SEGMENT_GAP = 2;
export const MAX_LAYOUT_ATTEMPTS = 100;
/** Share of the best-scored candidates the random pick is made from. */
export const TOP_SHARE = 0.2;
/** Spread is counted up to this distance (cells); further away scores the same. */
const SPREAD_CAP = 8;
const NOISE = 2.5;

/**
 * The segment mixes a battle can get (lengths): about 6 segments and 10-12
 * blocked cells. 3 × 1×1 + 2 × 1×2 + 1 × 1×3 = 10 cells; 2 + 2 + 2 = 12 cells.
 */
export const WALL_MIXES: ReadonlyArray<readonly number[]> = [
  [3, 2, 2, 1, 1, 1],
  [3, 3, 2, 2, 1, 1],
];

export const manhattan = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const chebyshev = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function segmentCells(x: number, y: number, length: number, horizontal: boolean): Cell[] {
  return Array.from({ length }, (_, i) => (horizontal ? { x: x + i, y } : { x, y: y + i }));
}

/** Macro zone (3 columns × 2 rows: A B C / D E F) of a cell, 0-5. */
function zoneOf(c: Cell, width: number, height: number): number {
  return Math.min(1, Math.floor((c.y * 2) / height)) * 3 + Math.min(2, Math.floor((c.x * 3) / width));
}

/** Can P1's start reach P2's start (4-way steps over free cells)? */
export function wallsLeaveAPath(width: number, height: number, walls: WallSegment[], from: Cell, to: Cell): boolean {
  const blocked = new Set(walls.flatMap((w) => w.cells.map((c) => c.y * width + c.x)));
  const seen = new Set([from.y * width + from.x]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    if (c.x === to.x && c.y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = n.y * width + n.x;
      if (n.x < 0 || n.y < 0 || n.x >= width || n.y >= height || blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return false;
}

/** All placements of one segment that keep the hard rules, with their scores. */
function candidates(s: CombatWallsSetup, placed: WallSegment[], length: number, horizontal: boolean, rng: RngState) {
  const { width, height, player1Start: p1, player2Start: p2 } = s;
  const placedCells = placed.flatMap((w) => w.cells);
  const zoneCount = [0, 0, 0, 0, 0, 0];
  for (const w of placed) zoneCount[zoneOf(w.cells[Math.floor(w.cells.length / 2)], width, height)]++;
  const out: Array<{ cells: Cell[]; score: number }> = [];
  const maxX = horizontal ? width - length : width - 1;
  const maxY = horizontal ? height - 1 : height - length;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= maxX; x++) {
      const cells = segmentCells(x, y, length, horizontal);
      let startDist = Infinity;
      let nearest = Infinity;
      let legal = true;
      for (const c of cells) {
        startDist = Math.min(startDist, manhattan(c, p1), manhattan(c, p2));
        for (const o of placedCells) nearest = Math.min(nearest, chebyshev(c, o));
        if (startDist < START_CLEARANCE || nearest < SEGMENT_GAP) {
          legal = false;
          break;
        }
      }
      if (!legal) continue;
      const spread = Math.min(nearest, SPREAD_CAP);
      // Fewer walls already in this macro zone = better (1, 0.59, 0.42, 0.32, ...).
      const zone = SPREAD_CAP / (1 + zoneCount[zoneOf(cells[Math.floor(length / 2)], width, height)] * 0.7);
      const start = Math.min(startDist, SPREAD_CAP);
      // 1×3 walls are spread out a little harder, so they stay separate landmarks.
      const score = spread * (length >= 3 ? 4 : 3) + zone * 2 + start * 2 + nextFloat(rng) * NOISE;
      out.push({ cells, score });
    }
  }
  return out;
}

/** One layout attempt: null if a segment found no legal place or P1 cannot reach P2. */
function tryLayout(s: CombatWallsSetup, rng: RngState): WallSegment[] | null {
  const mix = WALL_MIXES[nextInt(rng, 0, WALL_MIXES.length - 1)];
  const walls: WallSegment[] = [];
  for (const length of mix) {
    // Random orientation first; if it has no legal place, the other one.
    const first = length === 1 ? true : nextInt(rng, 0, 1) === 0;
    let list = candidates(s, walls, length, first, rng);
    let horizontal = first;
    if (!list.length && length > 1) {
      horizontal = !first;
      list = candidates(s, walls, length, horizontal, rng);
    }
    if (!list.length) return null;
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, Math.max(1, Math.ceil(list.length * TOP_SHARE)));
    const pick = top[nextInt(rng, 0, top.length - 1)];
    walls.push({ cells: pick.cells, orientation: length === 1 ? 'single' : horizontal ? 'horizontal' : 'vertical' });
  }
  return wallsLeaveAPath(s.width, s.height, walls, s.player1Start, s.player2Start) ? walls : null;
}

/**
 * The wall layout for one battle. Bad layouts are thrown away and redone
 * (at most MAX_LAYOUT_ATTEMPTS times); if none works the arena stays open.
 */
export function generateCombatWalls(s: CombatWallsSetup): WallSegment[] {
  const rng = createRng(s.seed);
  for (let i = 0; i < MAX_LAYOUT_ATTEMPTS; i++) {
    const walls = tryLayout(s, rng);
    if (walls) return walls;
  }
  return [];
}

// --- collision (combat units) ------------------------------------------------------------------

/** Does a circle at (x, y) with radius r overlap a wall cell? (Touching is allowed.) */
export function circleHitsWall(x: number, y: number, r: number, walls: WallSegment[], cellUnits: number): boolean {
  for (const w of walls) {
    for (const c of w.cells) {
      const x0 = c.x * cellUnits;
      const y0 = c.y * cellUnits;
      const nx = x < x0 ? x0 : x > x0 + cellUnits ? x0 + cellUnits : x;
      const ny = y < y0 ? y0 : y > y0 + cellUnits ? y0 + cellUnits : y;
      const dx = x - nx;
      const dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}
