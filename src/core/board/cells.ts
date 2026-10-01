// Board cell codes, used everywhere in Psychopomp (content, editors, UI):
//
//        1  2  3  4  5  6  7  8  9      columns 1..9  -> x 0..8
//   A   A1 A2 A3 A4 A5 A6 A7 A8 A9      rows    A..I  -> y 0..8
//   ...
//   I   I1 ...                  I9
//
// A1 is the top-left cell, A2 the cell right of it, E5 the centre of a 9×9
// board, I9 the bottom-right. Rows continue B, C, … for larger boards.

import type { Cell } from '../types';

export function cellCode(c: Cell): string {
  return `${String.fromCharCode(65 + c.y)}${c.x + 1}`;
}

/** "E5" -> { x: 4, y: 4 }. Returns null for anything that is not a cell code. */
export function parseCell(code: string): Cell | null {
  const m = /^([A-Za-z])(\d{1,2})$/.exec(code.trim());
  if (!m) return null;
  const y = m[1].toUpperCase().charCodeAt(0) - 65;
  const x = Number(m[2]) - 1;
  if (x < 0) return null;
  return { x, y };
}

export function cellInBoard(c: Cell, board: { width: number; height: number }): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < board.width && c.y < board.height;
}
