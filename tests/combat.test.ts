import { describe, expect, it } from 'vitest';
import { applyCommand, computeDamage, inAttackRange, type GameState } from '../src/core';
import { basePack, customMatch, fightToResult, ok, prepareBothAndBegin, testCreature, tick } from './helpers';

const MOVE_RIGHT = { dx: 100, dy: 0, attack: false, block: false };
const ATTACK = { dx: 0, dy: 0, attack: true, block: false };
const BLOCK = { dx: 0, dy: 0, attack: false, block: true };

/** d1 dice: every die is a 1, so battle stats are exactly base + 1. */
const fixed = (id: string, stats: Parameters<typeof testCreature>[1]) =>
  testCreature(id, stats, { dice: { sides: 1, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } } });

function closeIn(s: GameState): GameState {
  const rules = s.ruleset.combat;
  while (!inAttackRange(s.battle!.combat!.fighters.attacker, s.battle!.combat!.fighters.defender, rules)) {
    s = tick(s, MOVE_RIGHT);
  }
  return s;
}

function waitWindup(s: GameState): GameState {
  for (let i = 0; i < s.ruleset.combat.windupTicks; i++) if (s.battle?.stage === 'combat') s = tick(s);
  return s;
}

describe('combat formulas', () => {
  const rules = { minDamage: 1, shieldPercentPerPoint: 5, shieldMaxPercent: 80 } as never;
  const hit = (power: number, shield: number) =>
    computeDamage({ power, shield: 0, speed: 0, block: 0, dash: 0 }, { power: 0, shield, speed: 0, block: 0, dash: 0 }, rules);

  it('Shield takes 5 % off per point: Shield 6 = 30 % less damage', () => {
    expect(hit(10, 0)).toBe(10);
    expect(hit(10, 6)).toBe(7);
    expect(hit(10, 10)).toBe(5);
    expect(hit(20, 6)).toBe(14);
  });

  it('matches the agreed damage table (rounded to the nearest whole point)', () => {
    const shields = [0, 2, 4, 6, 8, 10];
    const table: Record<number, number[]> = {
      4: [4, 4, 3, 3, 2, 2],
      6: [6, 5, 5, 4, 4, 3],
      8: [8, 7, 6, 6, 5, 4],
      10: [10, 9, 8, 7, 6, 5],
      12: [12, 11, 10, 8, 7, 6],
      16: [16, 14, 13, 11, 10, 8],
      20: [20, 18, 16, 14, 12, 10],
    };
    for (const [power, row] of Object.entries(table)) expect(shields.map((s) => hit(Number(power), s))).toEqual(row);
    // The examples discussed: Power 10 vs Shield 5, Power 8 vs Shield 8, Power 6 vs Shield 5.
    expect([hit(10, 5), hit(8, 8), hit(6, 5)]).toEqual([8, 5, 5]);
  });

  it('Shield never takes off more than 80 %, and every hit does at least 1', () => {
    expect(hit(10, 16)).toBe(2);
    expect(hit(10, 50)).toBe(2);
    expect(hit(3, 50)).toBe(1);
    expect(hit(0, 0)).toBe(1);
  });

  it('the bundled ruleset uses 5 % per point and an 80 % cap', () => {
    const c = basePack().ruleset.combat;
    expect([c.shieldPercentPerPoint, c.shieldMaxPercent, c.minDamage]).toEqual([5, 80, 1]);
  });
});

describe('combat flow', () => {
  function duel(attacker: Parameters<typeof testCreature>[1], defender: Parameters<typeof testCreature>[1], extraP2 = false) {
    const placements = [
      { creature: 'a', owner: 'P1' as const, x: 0, y: 0 },
      { creature: 'b', owner: 'P2' as const, x: 1, y: 0 },
    ];
    if (extraP2) placements.push({ creature: 'b', owner: 'P2', x: 4, y: 0 });
    placements.push({ creature: 'a', owner: 'P1', x: 0, y: 2 });
    const s = customMatch({ creatures: [fixed('a', attacker), fixed('b', defender)], placements });
    return prepareBothAndBegin(ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 1, y: 0 } }));
  }

  it('a hit deals power reduced by shield (5 % per point)', () => {
    let s = closeIn(duel({ power: 10 }, { shield: 3 }));
    s = tick(s, ATTACK);
    s = waitWindup(s);
    // Power 10+1 = 11 vs Shield 3+1 = 4 -> 20 % off: 8.8 -> 9
    expect(s.battle!.combat!.fighters.defender.hp).toBe(20 - 9);
  });

  it('an attack out of range misses', () => {
    let s = duel({}, {});
    s = tick(s, ATTACK);
    s = waitWindup(s);
    expect(s.battle!.combat!.fighters.defender.hp).toBe(20);
  });

  it('a guard spends a block charge and negates the hit', () => {
    let s = closeIn(duel({ power: 15 }, { block: 3 })); // block 3+1 = 4 -> 2 charges
    expect(s.battle!.combat!.fighters.defender.blockCharges).toBe(2);
    s = tick(s, ATTACK, BLOCK);
    const r = applyCommand(s, { type: 'COMBAT_TICK', inputs: { attacker: { ...ATTACK, attack: false }, defender: { ...BLOCK, block: false } } });
    s = waitWindup(r.state);
    expect(s.battle!.combat!.fighters.defender.hp).toBe(20);
    expect(s.battle!.combat!.fighters.defender.blockCharges).toBe(1);
  });

  it('attacker wins: defender dies and is removed, attacker takes the cell', () => {
    let s = duel({ power: 40 }, { power: 0 }, true);
    s = fightToResult(s);
    expect(s.battle!.result!.outcome).toBe('ATTACKER_WINS');
    const r = applyCommand(s, { type: 'END_BATTLE' });
    s = r.state;
    expect(r.events).toContainEqual({ type: 'CREATURE_DIED', creatureId: 'P2-b-1' });
    expect(s.creatures['P2-b-1'].alive).toBe(false);
    expect(s.creatures['P1-a-1']).toMatchObject({ x: 1, y: 0, alive: true });
    expect(s.phase).toBe('board');
    expect(s.battle).toBeNull();
    expect(s.currentTurn.player).toBe('P2');
  });

  it('defender wins: attacker dies, defender keeps its cell', () => {
    let s = duel({ power: 0 }, { power: 40 }, true);
    s = fightToResult(s);
    expect(s.battle!.result!.outcome).toBe('DEFENDER_WINS');
    s = ok(s, { type: 'END_BATTLE' });
    expect(s.creatures['P1-a-1'].alive).toBe(false);
    expect(s.creatures['P2-b-1']).toMatchObject({ x: 1, y: 0, alive: true });
  });

  it('simultaneous death is a DRAW and removes both', () => {
    let s = closeIn(duel({ power: 40, maxHp: 5 }, { power: 40, maxHp: 5 }, true));
    s = tick(s, ATTACK, ATTACK);
    s = waitWindup(s);
    expect(s.battle!.result!.outcome).toBe('DRAW');
    s = ok(s, { type: 'END_BATTLE' });
    expect(s.creatures['P1-a-1'].alive).toBe(false);
    expect(s.creatures['P2-b-1'].alive).toBe(false);
  });

  it('timeout: attacker withdraws, both keep their HP', () => {
    let s = closeIn(duel({ power: 10 }, {}, true));
    s = tick(s, ATTACK);
    s = waitWindup(s);
    const hp = s.battle!.combat!.fighters.defender.hp;
    s = { ...s, ruleset: { ...s.ruleset, combat: { ...s.ruleset.combat, timeoutTicks: s.battle!.combat!.tick + 1 } } };
    s = tick(s);
    expect(s.battle!.result!.outcome).toBe('TIMEOUT');
    s = ok(s, { type: 'END_BATTLE' });
    expect(s.creatures['P1-a-1']).toMatchObject({ x: 0, y: 0, alive: true, hp: 20 });
    expect(s.creatures['P2-b-1']).toMatchObject({ x: 1, y: 0, alive: true, hp });
  });

  it('commands for the wrong battle stage are rejected', () => {
    const s = duel({}, {});
    expect(applyCommand(s, { type: 'END_BATTLE' }).error).toBeDefined();
    expect(applyCommand(s, { type: 'ROLL_DICE', player: 'P1' }).error).toBeDefined();
    expect(applyCommand(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-2', to: { x: 0, y: 3 } }).error).toBeDefined();
  });
});

describe('CRITICAL REGRESSION: persistent HP', () => {
  it('20 HP -> battle -> survives with 1 HP -> board -> next battle starts at 1 HP', () => {
    // tank: 20 HP, battle power 31, shield 1.  brute: 5 HP, battle power 20 -> hits tank for 19.
    const tank = fixed('tank', { maxHp: 20, power: 30, shield: 0 });
    const brute = fixed('brute', { maxHp: 5, power: 19, shield: 0 });
    let s = customMatch({
      creatures: [tank, brute],
      placements: [
        { creature: 'tank', owner: 'P1', x: 0, y: 0 },
        { creature: 'brute', owner: 'P2', x: 1, y: 0 },
        { creature: 'brute', owner: 'P2', x: 3, y: 0 },
      ],
    });
    expect(s.creatures['P1-tank-1'].hp).toBe(20);

    // Battle 1: tank attacks brute #1.
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-tank-1', to: { x: 1, y: 0 } });
    s = prepareBothAndBegin(s);
    expect(s.battle!.combat!.fighters.attacker.hp).toBe(20);
    s = closeIn(s);
    s = tick(s, undefined, ATTACK); // brute swings first
    s = waitWindup(s);
    expect(s.battle!.combat!.fighters.attacker.hp).toBe(1);
    s = tick(s, ATTACK); // tank answers
    s = waitWindup(s);
    expect(s.battle!.result).toMatchObject({ outcome: 'ATTACKER_WINS', attackerHp: 1 });
    s = ok(s, { type: 'END_BATTLE' });

    // Back on the board with exactly 1 HP.
    expect(s.phase).toBe('board');
    expect(s.creatures['P1-tank-1']).toMatchObject({ hp: 1, alive: true, x: 1, y: 0 });

    // Battle 2: brute #2 attacks the wounded tank.
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P2-brute-2', to: { x: 1, y: 0 } });
    expect(s.creatures['P1-tank-1'].hp).toBe(1);
    s = prepareBothAndBegin(s);
    const tankFighter = s.battle!.combat!.fighters.defender;
    expect(tankFighter.creatureId).toBe('P1-tank-1');
    expect(tankFighter.hp).toBe(1); // not 20, not maxHp
    expect(tankFighter.maxHp).toBe(20);
  });
});
