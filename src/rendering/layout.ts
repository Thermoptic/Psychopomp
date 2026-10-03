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

// Match screens, composed like the environment reference: the UI is mounted in
// a chamber, so the environment shows around it.
//   - side panels stand free at the outer edges (SIDE_MARGIN to the screen edge),
//   - the centre column holds the title plaque, the board and the message bar,
//   - one GAP between every pair of windows,
//   - above/below the side panels and along the edges the environment is visible.
// The board's frame is a square of CONTENT_H; its size did not change.

const VIEW = { w: 960, h: 540 };
export const GAP = 12;
export const SIDE_MARGIN = 36;
const TOP_H = 44;
const BAR_H = 36;
const CONTENT_Y = GAP + TOP_H + 8;
const CONTENT_H = 408;
const SIDE_W = (VIEW.w - 2 * SIDE_MARGIN - CONTENT_H - 2 * GAP) / 2;
const CENTRE_X = SIDE_MARGIN + SIDE_W + GAP;

/** Title plaque above the board (centre column). */
export const HEADER: Rect = { x: CENTRE_X, y: GAP, w: CONTENT_H, h: TOP_H };
export const LEFT_PANEL: Rect = { x: SIDE_MARGIN, y: CONTENT_Y, w: SIDE_W, h: CONTENT_H };
export const BOARD_AREA: Rect = { x: CENTRE_X, y: CONTENT_Y, w: CONTENT_H, h: CONTENT_H };
export const RIGHT_PANEL: Rect = { x: VIEW.w - SIDE_MARGIN - SIDE_W, y: CONTENT_Y, w: SIDE_W, h: CONTENT_H };
/** Message bar below the board (centre column). */
export const MESSAGE_BAR: Rect = { x: CENTRE_X, y: CONTENT_Y + CONTENT_H + 8, w: CONTENT_H, h: BAR_H };

/** Inner padding between a board/arena frame and its cells. */
export const FRAME_PAD = 10;

export interface BoardLayout {
  ox: number;
  oy: number;
  cell: number;
}

export function boardLayout(board: BoardDef): BoardLayout {
  const cell = Math.floor(Math.min((BOARD_AREA.w - 2 * FRAME_PAD) / board.width, (BOARD_AREA.h - 2 * FRAME_PAD) / board.height));
  return {
    cell,
    ox: BOARD_AREA.x + Math.floor((BOARD_AREA.w - cell * board.width) / 2),
    oy: BOARD_AREA.y + Math.floor((BOARD_AREA.h - cell * board.height) / 2),
  };
}

// --- Combat -------------------------------------------------------------------
//
// From READY+READY on, combat runs in a wide arena that opens out of the board:
// as wide as the HUD above it (both span the screen inside SIDE_MARGIN), as tall
// as the board, covering the side panels. The arena's column/row count is
// gameplay data (ruleset); only the on-screen cell size is computed here (20×9
// gives the board's own 43 px cells).

export const COMBAT_HUD: Rect = { x: SIDE_MARGIN, y: GAP, w: VIEW.w - 2 * SIDE_MARGIN, h: TOP_H };
export const ARENA_AREA: Rect = { x: SIDE_MARGIN, y: CONTENT_Y, w: VIEW.w - 2 * SIDE_MARGIN, h: CONTENT_H };

/** Fits a columns × rows grid of square cells into `area`, centred. */
export function arenaLayout(columns: number, rows: number, area: Rect = ARENA_AREA): BoardLayout {
  const cell = Math.floor(Math.min((area.w - 2 * FRAME_PAD) / columns, (area.h - 2 * FRAME_PAD) / rows));
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
  // Header (tag + phase) and creature sections above, Special + button below.
  const top = P.y + 92;
  const rowsArea = P.h - 92 - 104;
  const h = Math.min(50, Math.floor(rowsArea / Math.max(1, rowCount)));
  const d = Math.min(36, h - 10);
  const mirror = owner === 'P2';
  // x offsets measured from the panel's outer edge (left for P1, right for P2).
  const at = (off: number, w: number) => (mirror ? P.x + P.w - off - w : P.x + off);
  const rows: PrepRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const y = top + i * h;
    const cy = y + Math.floor((h - d) / 2);
    rows.push({
      // LOCK tab sticks out of the panel into the side margin (outer side).
      lock: { x: mirror ? P.x + P.w + 3 : P.x - 33, y: cy + Math.floor(d / 2) - 9, w: 30, h: 18 },
      die: { x: at(12, d), y: cy, w: d, h: d },
      slot: { x: at(12 + d + 6, d), y: cy, w: d, h: d },
      labelX: mirror ? P.x + P.w - (12 + 2 * d + 16) : P.x + 12 + 2 * d + 16,
      labelAlign: mirror ? 'right' : 'left',
      y,
      h,
    });
  }
  const specialY = top + rowCount * h + 6;
  return { panel: P, rows, specialY, button: { x: P.x + 22, y: P.y + P.h - 42, w: P.w - 44, h: 32 } };
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
