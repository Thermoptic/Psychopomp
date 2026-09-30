import { describe, expect, it } from 'vitest';
import { cellCentre, combatSpawnCell, type GameState } from '../src/core';
import { boardLayout } from '../src/rendering/layout';
import { boardSpritePx, boardUnits, isCombatView } from '../src/rendering/boardUnits';
import { customMatch, fightToResult, ok, prepareBothAndBegin, testCreature, tick } from './helpers';

const fixed = (id: string, stats: Parameters<typeof testCreature>[1] = {}) =>
  testCreature(id, stats, { dice: { sides: 1, slots: { speed: 1, power: 1, shield: 1, special: 1, block: 1 } } });

/** 9×9 board with bystanders on both sides. P1-a-1 at (3,2) can attack P2-b-1 at (5,2). */
function board9(): GameState {
  return customMatch({
    width: 9,
    height: 9,
    powerPoints: [
      { x: 4, y: 0 },
      { x: 4, y: 8 },
    ],
    creatures: [fixed('a', { power: 30 }), fixed('b', { power: 2 })],
    placements: [
      { creature: 'a', owner: 'P1', x: 3, y: 2 },
      { creature: 'a', owner: 'P1', x: 0, y: 7 },
      { creature: 'b', owner: 'P2', x: 5, y: 2 },
      { creature: 'b', owner: 'P2', x: 8, y: 7 },
    ],
  });
}

const cellCentrePx = (s: GameState, x: number, y: number) => {
  const l = boardLayout(s.board);
  return { cx: l.ox + x * l.cell + l.cell / 2, cy: l.oy + y * l.cell + l.cell / 2 };
};

describe('combat on the strategic board', () => {
  it('spawn cells: P1 centre-left (col 1, row 5), P2 centre-right (col 9, row 5)', () => {
    expect(combatSpawnCell({ width: 9, height: 9 }, 'P1')).toEqual({ x: 0, y: 4 });
    expect(combatSpawnCell({ width: 9, height: 9 }, 'P2')).toEqual({ x: 8, y: 4 });
  });

  it('P1 combatant starts centre-left and P2 combatant centre-right (P1 attacking)', () => {
    let s = ok(board9(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    s = prepareBothAndBegin(s);
    const rules = s.ruleset.combat;
    const { attacker, defender } = s.battle!.combat!.fighters;
    expect({ x: attacker.x, y: attacker.y }).toEqual(cellCentre({ x: 0, y: 4 }, rules));
    expect({ x: defender.x, y: defender.y }).toEqual(cellCentre({ x: 8, y: 4 }, rules));
    expect(s.battle!.combat!.arena).toEqual({ width: 9 * rules.cellUnits, height: 9 * rules.cellUnits });
  });

  it('sides follow the player, not attacker/defender (P2 attacking)', () => {
    let s = ok(board9(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-2', to: { x: 0, y: 6 } });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P2-b-1', to: { x: 3, y: 2 } });
    s = prepareBothAndBegin(s);
    const rules = s.ruleset.combat;
    const { attacker, defender } = s.battle!.combat!.fighters;
    expect(attacker.creatureId).toBe('P2-b-1');
    expect({ x: attacker.x, y: attacker.y }).toEqual(cellCentre({ x: 8, y: 4 }, rules));
    expect({ x: defender.x, y: defender.y }).toEqual(cellCentre({ x: 0, y: 4 }, rules));
  });

  it('renders only the two combatants, at the board creature scale, on the spawn cells', () => {
    const s0 = board9();
    const l = boardLayout(s0.board);
    const boardMode = boardUnits(s0, l);
    expect(boardMode).toHaveLength(4);

    let s = ok(s0, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    s = prepareBothAndBegin(s);
    expect(isCombatView(s)).toBe(true);
    const units = boardUnits(s, l);
    expect(units.map((u) => u.creatureId).sort()).toEqual(['P1-a-1', 'P2-b-1']);
    // Same scale as on the strategic board.
    for (const u of units) {
      expect(u.px).toBe(boardSpritePx(l));
      expect(u.px).toBe(boardMode[0].px);
    }
    const p1 = units.find((u) => u.owner === 'P1')!;
    const p2 = units.find((u) => u.owner === 'P2')!;
    expect({ cx: p1.cx, cy: p1.cy }).toEqual(cellCentrePx(s, 0, 4));
    expect({ cx: p2.cx, cy: p2.cy }).toEqual(cellCentrePx(s, 8, 4));
  });

  it('non-combatants are hidden during combat and the result screen, visible again after', () => {
    let s = ok(board9(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    s = prepareBothAndBegin(s);
    const l = boardLayout(s.board);
    const ids = () => boardUnits(s, l).map((u) => u.creatureId).sort();
    expect(ids()).not.toContain('P1-a-2');
    expect(ids()).not.toContain('P2-b-2');
    s = fightToResult(s);
    expect(s.battle!.stage).toBe('result');
    expect(ids()).toEqual(['P1-a-1', 'P2-b-1']);
    s = ok(s, { type: 'END_BATTLE' });
    expect(isCombatView(s)).toBe(false);
    // Loser (P2-b-1) is dead; everyone else is back.
    expect(ids()).toEqual(['P1-a-1', 'P1-a-2', 'P2-b-2']);
  });

  it('combat positions never overwrite strategic board positions', () => {
    const s0 = board9();
    let s = ok(s0, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    s = prepareBothAndBegin(s);
    // Walk the P1 combatant around the board.
    for (let i = 0; i < 30; i++) s = tick(s, { dx: 1, dy: 1, attack: false, block: false });
    const f = s.battle!.combat!.fighters.attacker;
    expect(f.y).not.toBe(cellCentre({ x: 0, y: 4 }, s.ruleset.combat).y);
    for (const id of Object.keys(s0.creatures)) {
      expect({ x: s.creatures[id].x, y: s.creatures[id].y }).toEqual({ x: s0.creatures[id].x, y: s0.creatures[id].y });
    }
    s = ok(fightToResult(s), { type: 'END_BATTLE' });
    // Existing rule: the winning attacker takes the contested cell; bystanders are untouched.
    expect(s.creatures['P1-a-1']).toMatchObject({ x: 5, y: 2 });
    expect(s.creatures['P1-a-2']).toMatchObject({ x: 0, y: 7 });
    expect(s.creatures['P2-b-2']).toMatchObject({ x: 8, y: 7 });
  });

  it('persistent HP: damage taken on the board fight is kept after returning', () => {
    let s = ok(board9(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    s = fightToResult(prepareBothAndBegin(s));
    const hp = s.battle!.result!.attackerHp;
    expect(hp).toBeLessThan(20); // b hits for max(1, 3 - 5) = 1 at least once
    s = ok(s, { type: 'END_BATTLE' });
    expect(s.creatures['P1-a-1'].hp).toBe(hp);
    const units = boardUnits(s, boardLayout(s.board));
    expect(units.find((u) => u.creatureId === 'P1-a-1')!.hp).toBe(hp);
  });
});
