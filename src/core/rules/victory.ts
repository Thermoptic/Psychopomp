import type { GameState, MatchResult, PlayerId } from '../types';
import { livingCreatures } from '../board/queries';

export function resultFor(p: PlayerId): MatchResult {
  return p === 'P1' ? 'PLAYER_1' : 'PLAYER_2';
}

/**
 * Elimination takes precedence over Power Points. Both sides eliminated at
 * once (simultaneous death of the last creatures) is a DRAW.
 */
export function evaluateVictory(state: GameState): { result: MatchResult; reason: GameState['victoryReason'] } {
  const p1 = livingCreatures(state, 'P1').length;
  const p2 = livingCreatures(state, 'P2').length;
  if (p1 === 0 && p2 === 0) return { result: 'DRAW', reason: 'elimination' };
  if (p1 === 0) return { result: 'PLAYER_2', reason: 'elimination' };
  if (p2 === 0) return { result: 'PLAYER_1', reason: 'elimination' };

  if (state.powerPoints.length > 0) {
    const owner = state.powerPoints[0].owner;
    if (owner && state.powerPoints.every((p) => p.owner === owner)) {
      return { result: resultFor(owner), reason: 'powerPoints' };
    }
  }
  return { result: 'ONGOING', reason: null };
}
