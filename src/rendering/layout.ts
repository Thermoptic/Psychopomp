// Screen layout shared by the renderer (drawing) and the app (mouse hit tests).
// Pure geometry — no game rules.

import type { BoardDef, Cell, DicePrep } from '../core/types';

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

// --- Dice screen ------------------------------------------------------------

export const DICE_SCREEN: Rect = { x: 110, y: 54, w: 740, h: 418 };

export type DiceItem =
  | { kind: 'die'; i: number }
  | { kind: 'slot'; i: number }
  | { kind: 'btn'; id: 'roll' | 'reroll' | 'keep' | 'clear' | 'confirm' };

export interface PlacedItem {
  item: DiceItem;
  rect: Rect;
}

const DIE = 60;

/** Rows of focusable items for the dice screen, with their rectangles. */
export function diceScreenRows(prep: DicePrep): PlacedItem[][] {
  const rows: PlacedItem[][] = [];
  const cx = DICE_SCREEN.x + DICE_SCREEN.w / 2;

  const n = prep.dice.length;
  const gap = 22;
  const diceW = n * DIE + (n - 1) * gap;
  rows.push(
    prep.dice.map((_, i) => ({
      item: { kind: 'die', i },
      rect: { x: Math.round(cx - diceW / 2 + i * (DIE + gap)), y: 146, w: DIE, h: DIE },
    })),
  );

  const btn = (id: Extract<DiceItem, { kind: 'btn' }>['id'], i: number, count: number, y: number): PlacedItem => {
    const w = 170;
    const g = 20;
    const total = count * w + (count - 1) * g;
    return { item: { kind: 'btn', id }, rect: { x: Math.round(cx - total / 2 + i * (w + g)), y, w, h: 34 } };
  };

  if (prep.stage === 'roll') {
    rows.push(prep.rollsUsed === 0 ? [btn('roll', 0, 1, 250)] : [btn('reroll', 0, 2, 250), btn('keep', 1, 2, 250)]);
  } else {
    const m = prep.slots.length;
    const sw = Math.min(118, Math.floor((DICE_SCREEN.w - 40) / m) - 10);
    const sg = 10;
    const total = m * sw + (m - 1) * sg;
    rows.push(
      prep.slots.map((_, i) => ({
        item: { kind: 'slot', i },
        rect: { x: Math.round(cx - total / 2 + i * (sw + sg)), y: 246, w: sw, h: 104 },
      })),
    );
    rows.push([btn('clear', 0, 2, 414), btn('confirm', 1, 2, 414)]);
  }
  return rows;
}

// --- Combat -----------------------------------------------------------------

export const ARENA_ORIGIN = { x: 80, y: 118 };
