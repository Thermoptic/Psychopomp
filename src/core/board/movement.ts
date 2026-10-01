// Legal board movement. The UI may only *display* the result of these queries.

import type { Cell, CreatureState, GameState } from '../types';
import { creatureAt, inBounds, isBlocked } from './queries';

export interface LegalMove extends Cell {
  /** Number of steps to reach this cell. */
  steps: number;
  /** Id of the enemy creature on this cell; moving here starts a battle. */
  attacks: string | null;
}

const ORTHO: Cell[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
const DIAG: Cell[] = [
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/**
 * All cells the creature may move to this turn.
 *
 * DEFAULT movement: up to `stats.movement` steps through empty cells, ending
 * on an empty cell or on an enemy (which ends the path and starts a battle).
 * Friendly creatures block unless the board allows passing through them (they
 * can never be a destination).
 *
 * PATTERN movement: see patternMoves — same board rules, but the destinations
 * come from the creature's movement pattern.
 */
export function getLegalMoves(state: GameState, creatureId: string): LegalMove[] {
  const cr = state.creatures[creatureId];
  if (!cr || !cr.alive) return [];
  const def = state.creatureDefs[cr.defId];
  if (def.movement?.type === 'pattern') return patternMoves(state, cr, def.movement.cells);
  const range = def.stats.movement;
  const dirs = state.board.allowDiagonal ? [...ORTHO, ...DIAG] : ORTHO;

  const key = (c: Cell) => c.y * state.board.width + c.x;
  const seen = new Map<number, LegalMove>();
  const visited = new Set<number>([key(cr)]);
  let frontier: Cell[] = [{ x: cr.x, y: cr.y }];

  for (let step = 1; step <= range && frontier.length > 0; step++) {
    const next: Cell[] = [];
    for (const from of frontier) {
      for (const d of dirs) {
        const c = { x: from.x + d.x, y: from.y + d.y };
        const k = key(c);
        if (!inBounds(state, c) || isBlocked(state, c) || visited.has(k)) continue;
        visited.add(k);
        const occupant = creatureAt(state, c);
        if (!occupant) {
          seen.set(k, { x: c.x, y: c.y, steps: step, attacks: null });
          next.push(c);
        } else if (occupant.owner !== cr.owner) {
          seen.set(k, { x: c.x, y: c.y, steps: step, attacks: occupant.id });
        } else if (state.board.passThroughCreatures) {
          next.push(c);
        }
      }
    }
    frontier = next;
  }
  return [...seen.values()];
}

/**
 * Pattern movement: each offset is one allowed destination, relative to the
 * creature's cell. Same rules as default movement: on the board, not a
 * blocked cell, not a friendly creature (an enemy = battle). Offsets on a
 * straight or diagonal line need a clear path (no creature or blocked cell in
 * between, unless the board allows passing creatures); other offsets (e.g. a
 * knight-like jump) jump over everything.
 */
function patternMoves(state: GameState, cr: CreatureState, cells: Cell[]): LegalMove[] {
  const out: LegalMove[] = [];
  const seen = new Set<string>();
  for (const off of cells) {
    if (off.x === 0 && off.y === 0) continue;
    const c = { x: cr.x + off.x, y: cr.y + off.y };
    const k = `${c.x},${c.y}`;
    if (seen.has(k) || !inBounds(state, c) || isBlocked(state, c)) continue;
    seen.add(k);
    const occupant = creatureAt(state, c);
    if (occupant && occupant.owner === cr.owner) continue;
    if (!pathClear(state, cr, off)) continue;
    out.push({ x: c.x, y: c.y, steps: Math.max(Math.abs(off.x), Math.abs(off.y)), attacks: occupant ? occupant.id : null });
  }
  return out;
}

/** Cells strictly between the creature and a straight/diagonal offset must be free. */
function pathClear(state: GameState, cr: CreatureState, off: Cell): boolean {
  const ax = Math.abs(off.x);
  const ay = Math.abs(off.y);
  const line = ax === 0 || ay === 0 || ax === ay;
  if (!line) return true; // jump
  const n = Math.max(ax, ay);
  const sx = Math.sign(off.x);
  const sy = Math.sign(off.y);
  for (let i = 1; i < n; i++) {
    const c = { x: cr.x + sx * i, y: cr.y + sy * i };
    if (isBlocked(state, c)) return false;
    const occupant = creatureAt(state, c);
    if (occupant && !(state.board.passThroughCreatures && occupant.owner === cr.owner)) return false;
  }
  return true;
}

export function findLegalMove(state: GameState, creatureId: string, to: Cell): LegalMove | undefined {
  return getLegalMoves(state, creatureId).find((m) => m.x === to.x && m.y === to.y);
}

/** Creatures of the current player that have at least one legal move. */
export function getMovableCreatures(state: GameState): string[] {
  if (state.phase !== 'board') return [];
  return Object.values(state.creatures)
    .filter((c) => c.alive && c.owner === state.currentTurn.player)
    .filter((c) => getLegalMoves(state, c.id).length > 0)
    .map((c) => c.id);
}
