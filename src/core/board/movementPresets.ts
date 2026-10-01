// Shared movement-pattern definitions, used by the Developer Editor (pattern
// editor) and the game's board rendering (info panel). Data only: legal moves
// are always decided by board/movement.ts.
//
// The pattern editor is a 9×9 grid with the monster in the centre (E5), so
// offsets -4..+4 can be drawn. Patterns are stored relative to the monster.

import type { Cell, CreatureDef } from '../types';

export const PATTERN_RADIUS = 4;

export interface MovePreset {
  id: string;
  label: string;
  cells: () => Cell[];
}

const lineCells = (dirs: Array<[number, number]>, max = PATTERN_RADIUS): Cell[] =>
  dirs.flatMap(([dx, dy]) => Array.from({ length: max }, (_, i) => ({ x: dx * (i + 1), y: dy * (i + 1) })));

/** Ready-made patterns; picking one fills the pattern, which can then be edited cell by cell. */
export const MOVE_PRESETS: MovePreset[] = [
  { id: 'cross', label: 'CROSS — 1 step (↑ ↓ ← →)', cells: () => lineCells([[0, -1], [0, 1], [-1, 0], [1, 0]], 1) },
  { id: 'king', label: 'KING — 1 step all around', cells: () => lineCells([[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]], 1) },
  { id: 'rook', label: 'ROOK — straight lines', cells: () => lineCells([[0, -1], [0, 1], [-1, 0], [1, 0]]) },
  { id: 'bishop', label: 'BISHOP — diagonals', cells: () => lineCells([[-1, -1], [1, -1], [-1, 1], [1, 1]]) },
  {
    id: 'knight',
    label: 'KNIGHT — L-shaped jumps',
    cells: () => [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]].map(([x, y]) => ({ x, y })),
  },
];

export function isPatternMovement(def: CreatureDef): boolean {
  return def.movement?.type === 'pattern';
}

export function patternCells(def: CreatureDef): Cell[] {
  return def.movement?.type === 'pattern' ? def.movement.cells : [];
}
