import type { Cell, CreatureState, GameState, PlayerId } from '../types';

export function inBounds(state: GameState, c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < state.board.width && c.y < state.board.height;
}

export function isBlocked(state: GameState, c: Cell): boolean {
  return state.board.blockedCells.some((b) => b.x === c.x && b.y === c.y);
}

export function creatureAt(state: GameState, c: Cell): CreatureState | undefined {
  for (const id in state.creatures) {
    const cr = state.creatures[id];
    if (cr.alive && cr.x === c.x && cr.y === c.y) return cr;
  }
  return undefined;
}

export function livingCreatures(state: GameState, owner?: PlayerId): CreatureState[] {
  return Object.values(state.creatures).filter((c) => c.alive && (owner === undefined || c.owner === owner));
}

export function powerPointAt(state: GameState, c: Cell) {
  return state.powerPoints.find((p) => p.x === c.x && p.y === c.y);
}

export function otherPlayer(p: PlayerId): PlayerId {
  return p === 'P1' ? 'P2' : 'P1';
}
