// Which creatures the board draws, where, and at what scale. Pure (no canvas),
// so it can be unit-tested.
//
// Board mode: every living creature at the centre of its board cell.
// Combat mode (battle stage 'combat' or 'result'): the same board, but only
// the two combatants, placed at their temporary combat positions. Board
// creature positions in GameState are never changed by this.

import type { Fighter, GameState, PlayerId } from '../core/types';
import type { BoardLayout } from './layout';

export interface BoardUnit {
  creatureId: string;
  defId: string;
  owner: PlayerId;
  /** Sprite centre in screen (logical canvas) pixels. */
  cx: number;
  cy: number;
  /** Size of one sprite art pixel. Identical in board and combat mode. */
  px: number;
  hp: number;
  maxHp: number;
  /** Set in combat mode. */
  fighter: Fighter | null;
}

/** Art-pixel size for creatures on the board (also used during combat). */
export function boardSpritePx(l: BoardLayout): number {
  return Math.max(2, Math.floor(l.cell / 13));
}

export function isCombatView(state: GameState): boolean {
  const b = state.battle;
  return !!b && !!b.combat && (b.stage === 'combat' || b.stage === 'result');
}

/** Converts a combat-unit coordinate to a screen pixel on the board. */
export function combatToScreen(state: GameState, l: BoardLayout, x: number, y: number): { x: number; y: number } {
  const u = state.ruleset.combat.cellUnits;
  return { x: l.ox + (x * l.cell) / u, y: l.oy + (y * l.cell) / u };
}

export function boardUnits(state: GameState, l: BoardLayout): BoardUnit[] {
  const px = boardSpritePx(l);
  if (isCombatView(state)) {
    return Object.values(state.battle!.combat!.fighters).map((f) => {
      const cr = state.creatures[f.creatureId];
      const p = combatToScreen(state, l, f.x, f.y);
      return { creatureId: cr.id, defId: cr.defId, owner: cr.owner, cx: p.x, cy: p.y, px, hp: f.hp, maxHp: f.maxHp, fighter: f };
    });
  }
  return Object.values(state.creatures)
    .filter((c) => c.alive)
    .map((c) => ({
      creatureId: c.id,
      defId: c.defId,
      owner: c.owner,
      cx: l.ox + c.x * l.cell + l.cell / 2,
      cy: l.oy + c.y * l.cell + l.cell / 2,
      px,
      hp: c.hp,
      maxHp: state.creatureDefs[c.defId].stats.maxHp,
      fighter: null,
    }));
}
