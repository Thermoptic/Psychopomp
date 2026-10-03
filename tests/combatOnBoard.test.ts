import { describe, expect, it } from 'vitest';
import { arenaGrid, cellCentre, combatSpawnCell, type GameState } from '../src/core';
import { ARENA_AREA, BOARD_AREA, COMBAT_HUD, arenaLayout, boardLayout, prepItemAt, prepPanelLayout } from '../src/rendering/layout';
import { boardSpritePx, boardUnits, isArenaView, isCombatView } from '../src/rendering/boardUnits';
import { customMatch, fightToResult, ok, prepareBothAndBegin, quickPrepare, testCreature, tick } from './helpers';

const fixed = (id: string, stats: Parameters<typeof testCreature>[1] = {}) =>
  testCreature(id, stats, { dice: { sides: 1, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } } });

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

const arenaOf = (s: GameState) => {
  const g = arenaGrid(s.ruleset.combat);
  return arenaLayout(g.width, g.height);
};
const cellCentrePx = (s: GameState, x: number, y: number) => {
  const l = arenaOf(s);
  return { cx: l.ox + x * l.cell + l.cell / 2, cy: l.oy + y * l.cell + l.cell / 2 };
};

describe('combat arena', () => {
  it('the arena is wider than the strategic board and its size is ruleset data', () => {
    const s = board9();
    const g = arenaGrid(s.ruleset.combat);
    expect(g).toEqual({ width: 20, height: 9 });
    expect(g.width).toBeGreaterThan(s.board.width * 2);
  });

  it('spawn cells: P1 leftmost column, P2 rightmost column, both on the centre row', () => {
    expect(combatSpawnCell({ width: 20, height: 9 }, 'P1')).toEqual({ x: 0, y: 4 });
    expect(combatSpawnCell({ width: 20, height: 9 }, 'P2')).toEqual({ x: 19, y: 4 });
    expect(combatSpawnCell({ width: 9, height: 9 }, 'P2')).toEqual({ x: 8, y: 4 });
    expect(combatSpawnCell({ width: 30, height: 11 }, 'P2')).toEqual({ x: 29, y: 5 });
  });

  it('arena cells keep roughly the strategic board cell size (not stretched)', () => {
    const s = board9();
    const arena = arenaOf(s);
    const board = boardLayout(s.board);
    const g = arenaGrid(s.ruleset.combat);
    expect(Math.abs(arena.cell - board.cell)).toBeLessThanOrEqual(4);
    // Uses (almost) the full available width.
    expect(arena.cell * g.width).toBeGreaterThan(ARENA_AREA.w * 0.9);
    expect(arena.cell * g.height).toBeLessThanOrEqual(ARENA_AREA.h);
  });

  it('the arena lines up with the HUD above it and with the board vertically', () => {
    expect({ x: ARENA_AREA.x, w: ARENA_AREA.w }).toEqual({ x: COMBAT_HUD.x, w: COMBAT_HUD.w });
    expect({ y: ARENA_AREA.y, h: ARENA_AREA.h }).toEqual({ y: BOARD_AREA.y, h: BOARD_AREA.h });
    // 20 columns give exactly the board's cell size.
    const s = board9();
    expect(arenaOf(s).cell).toBe(boardLayout(s.board).cell);
  });

  it('the wide arena is only used once both players are READY', () => {
    let s = ok(board9(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    expect(isArenaView(s)).toBe(false);
    s = quickPrepare(s, 'P1');
    expect(isArenaView(s)).toBe(false); // only P1 READY: still preparing on the board
    s = quickPrepare(s, 'P2');
    expect(s.battle!.stage).toBe('countdown');
    expect(isArenaView(s)).toBe(true);
    // During the countdown the combatants already wait on the arena spawn cells.
    const units = boardUnits(s, arenaOf(s));
    const p1 = units.find((u) => u.owner === 'P1')!;
    const p2 = units.find((u) => u.owner === 'P2')!;
    expect({ cx: p1.cx, cy: p1.cy }).toEqual(cellCentrePx(s, 0, 4));
    expect({ cx: p2.cx, cy: p2.cy }).toEqual(cellCentrePx(s, 19, 4));
  });

  it('movement covers the whole arena (corner to corner)', () => {
    let s = ok(board9(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    s = prepareBothAndBegin(s);
    const arena = s.battle!.combat!.arena;
    const r = s.ruleset.combat.fighterRadius;
    for (let i = 0; i < 400; i++) s = tick(s, { dx: 0, dy: -100, attack: false, block: false });
    for (let i = 0; i < 1000; i++) s = tick(s, { dx: 100, dy: 0, attack: false, block: false }, { dx: 0, dy: 100, attack: false, block: false });
    const a = s.battle!.combat!.fighters.attacker;
    expect(a.y).toBe(r);
    expect(a.x).toBe(arena.width - r);
  });

  it('P1 combatant starts centre-left and P2 combatant centre-right (P1 attacking)', () => {
    let s = ok(board9(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    s = prepareBothAndBegin(s);
    const rules = s.ruleset.combat;
    const { attacker, defender } = s.battle!.combat!.fighters;
    expect({ x: attacker.x, y: attacker.y }).toEqual(cellCentre({ x: 0, y: 4 }, rules));
    expect({ x: defender.x, y: defender.y }).toEqual(cellCentre({ x: 19, y: 4 }, rules));
    expect(s.battle!.combat!.arena).toEqual({ width: 20 * rules.cellUnits, height: 9 * rules.cellUnits });
  });

  it('sides follow the player, not attacker/defender (P2 attacking)', () => {
    let s = ok(board9(), { type: 'MOVE_CREATURE', creatureId: 'P1-a-2', to: { x: 0, y: 6 } });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P2-b-1', to: { x: 3, y: 2 } });
    s = prepareBothAndBegin(s);
    const rules = s.ruleset.combat;
    const { attacker, defender } = s.battle!.combat!.fighters;
    expect(attacker.creatureId).toBe('P2-b-1');
    expect({ x: attacker.x, y: attacker.y }).toEqual(cellCentre({ x: 19, y: 4 }, rules));
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
    const al = arenaOf(s);
    const units = boardUnits(s, al);
    expect(units.map((u) => u.creatureId).sort()).toEqual(['P1-a-1', 'P2-b-1']);
    // Same creature scale as on the strategic board.
    for (const u of units) {
      expect(u.px).toBe(boardSpritePx(al));
      expect(u.px).toBe(boardMode[0].px);
    }
    const p1 = units.find((u) => u.owner === 'P1')!;
    const p2 = units.find((u) => u.owner === 'P2')!;
    expect({ cx: p1.cx, cy: p1.cy }).toEqual(cellCentrePx(s, 0, 4));
    expect({ cx: p2.cx, cy: p2.cy }).toEqual(cellCentrePx(s, 19, 4));
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
    for (let i = 0; i < 30; i++) s = tick(s, { dx: 100, dy: 100, attack: false, block: false });
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

describe('dice panel layout', () => {
  it('LOCK tabs sit outside the panel in the side margin; every part is clickable and fits', () => {
    for (const owner of ['P1', 'P2'] as const) {
      const L = prepPanelLayout(owner, 5);
      const P = L.panel;
      for (const [i, row] of L.rows.entries()) {
        const outside = owner === 'P1' ? row.lock.x + row.lock.w <= P.x : row.lock.x >= P.x + P.w;
        expect(outside).toBe(true);
        expect(row.lock.x).toBeGreaterThanOrEqual(0);
        expect(row.lock.x + row.lock.w).toBeLessThanOrEqual(960);
        const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;
        expect(prepItemAt(L, ...centre(row.lock))).toEqual({ kind: 'lock', i });
        expect(prepItemAt(L, ...centre(row.die))).toEqual({ kind: 'die', i });
        expect(prepItemAt(L, ...centre(row.slot))).toEqual({ kind: 'slot', i });
      }
      expect(prepItemAt(L, L.button.x + 5, L.button.y + 5)).toEqual({ kind: 'button' });
      // Rows, the Special section and the button stay inside the panel, in that order.
      const last = L.rows[L.rows.length - 1];
      expect(L.rows[0].y).toBeGreaterThanOrEqual(P.y + 90);
      expect(L.specialY).toBeGreaterThanOrEqual(last.y + last.h);
      expect(L.button.y - L.specialY).toBeGreaterThan(40);
      expect(L.button.y + L.button.h).toBeLessThanOrEqual(P.y + P.h);
    }
  });
});
