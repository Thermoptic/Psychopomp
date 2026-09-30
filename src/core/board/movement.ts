// Legal board movement. The UI may only *display* the result of these queries.

import type { Cell, GameState } from '../types';
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
 * All cells the creature may move to this turn: up to `movement` steps through
 * empty cells, ending on an empty cell or on an enemy (which ends the path and
 * starts a battle). Friendly creatures block unless the board allows passing
 * through them (they can never be a destination).
 */
export function getLegalMoves(state: GameState, creatureId: string): LegalMove[] {
  const cr = state.creatures[creatureId];
  if (!cr || !cr.alive) return [];
  const def = state.creatureDefs[cr.defId];
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
