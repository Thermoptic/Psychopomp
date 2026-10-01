// Screen layout shared by the renderer (drawing) and the app (mouse hit tests).
// Pure geometry — no game rules.

import type { BoardDef, Cell } from '../core/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inRect = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

export const HEADER: Rect = { x: 0, y: 0, w: 960, h: 44 };
export const LEFT_PANEL: Rect = { x: 12, y: 54, w: 226, h: 418 };
export const RIGHT_PANEL: Rect = { x: 722, y: 54, w: 226, h: 418 };
export const BOARD_AREA: Rect = { x: 250, y: 54, w: 460, h: 418 };
export const MESSAGE_BAR: Rect = { x: 12, y: 482, w: 936, h: 46 };

export interface BoardLayout {
  ox: number;
  oy: number;
  cell: number;
}

export function boardLayout(board: BoardDef): BoardLayout {
  const cell = Math.floor(Math.min(BOARD_AREA.w / board.width, BOARD_AREA.h / board.height));
  return {
    cell,
    ox: BOARD_AREA.x + Math.floor((BOARD_AREA.w - cell * board.width) / 2),
    oy: BOARD_AREA.y + Math.floor((BOARD_AREA.h - cell * board.height) / 2),
  };
}

// --- Combat arena -------------------------------------------------------------
//
// From READY+READY on, the battle uses a top HUD and a wide arena that fills
// everything between the HUD and the message bar. The arena's column/row count
// is gameplay data (ruleset); only the on-screen cell size is computed here.

export const COMBAT_HUD: Rect = { x: 12, y: 4, w: 936, h: 50 };
export const ARENA_AREA: Rect = { x: 12, y: 60, w: 936, h: 414 };
const ARENA_FRAME = 8;

/** Fits a columns × rows grid of square cells into `area`, centred. */
export function arenaLayout(columns: number, rows: number, area: Rect = ARENA_AREA): BoardLayout {
  const cell = Math.floor(Math.min((area.w - 2 * ARENA_FRAME) / columns, (area.h - 2 * ARENA_FRAME) / rows));
  return {
    cell,
    ox: area.x + Math.floor((area.w - cell * columns) / 2),
    oy: area.y + Math.floor((area.h - cell * rows) / 2),
  };
}

export function cellRect(l: BoardLayout, c: Cell): Rect {
  return { x: l.ox + c.x * l.cell, y: l.oy + c.y * l.cell, w: l.cell, h: l.cell };
}

export function cellAtPoint(board: BoardDef, x: number, y: number): Cell | null {
  const l = boardLayout(board);
  const cx = Math.floor((x - l.ox) / l.cell);
  const cy = Math.floor((y - l.oy) / l.cell);
  if (cx < 0 || cy < 0 || cx >= board.width || cy >= board.height) return null;
  return { x: cx, y: cy };
}

// --- Preparation panels ----------------------------------------------------------
//
// Each player prepares in their own side panel (P1 left, P2 right, mirrored).
// One row per die: [LOCK tag] [die] [slot] [category], P2 reversed.

export type PrepItem = { kind: 'die'; i: number } | { kind: 'slot'; i: number } | { kind: 'lock'; i: number } | { kind: 'button' };

export interface PrepRow {
  lock: Rect;
  die: Rect;
  slot: Rect;
  /** Text anchor for the category label. */
  labelX: number;
  labelAlign: 'left' | 'right';
  y: number;
  h: number;
}

export interface PrepPanelLayout {
  panel: Rect;
  rows: PrepRow[];
  specialY: number;
  button: Rect;
}

export function prepPanelLayout(owner: 'P1' | 'P2', rowCount: number): PrepPanelLayout {
  const P = owner === 'P1' ? LEFT_PANEL : RIGHT_PANEL;
  const top = P.y + 80;
  const rowsArea = P.h - 80 - 96;
  const h = Math.min(50, Math.floor(rowsArea / Math.max(1, rowCount)));
  const d = Math.min(38, h - 10);
  const mirror = owner === 'P2';
  // x offsets measured from the panel's outer edge (left for P1, right for P2).
  const at = (off: number, w: number) => (mirror ? P.x + P.w - off - w : P.x + off);
  const rows: PrepRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const y = top + i * h;
    const cy = y + Math.floor((h - d) / 2);
    rows.push({
      lock: { x: at(4, 28), y: cy + Math.floor(d / 2) - 7, w: 28, h: 14 },
      die: { x: at(34, d), y: cy, w: d, h: d },
      slot: { x: at(36 + d + 6, d), y: cy, w: d, h: d },
      labelX: mirror ? P.x + P.w - (36 + 2 * d + 16) : P.x + 36 + 2 * d + 16,
      labelAlign: mirror ? 'right' : 'left',
      y,
      h,
    });
  }
  const specialY = top + rowCount * h + 16;
  return { panel: P, rows, specialY, button: { x: P.x + 22, y: P.y + P.h - 48, w: P.w - 44, h: 36 } };
}

/** Which preparation item (if any) is under a point. */
export function prepItemAt(layout: PrepPanelLayout, x: number, y: number): PrepItem | null {
  if (inRect(layout.button, x, y)) return { kind: 'button' };
  for (let i = 0; i < layout.rows.length; i++) {
    const r = layout.rows[i];
    if (inRect(r.lock, x, y)) return { kind: 'lock', i };
    if (inRect(r.die, x, y)) return { kind: 'die', i };
    if (inRect(r.slot, x, y)) return { kind: 'slot', i };
  }
  return null;
}
