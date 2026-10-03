import { describe, expect, it } from 'vitest';
import { LEVEL_UP_STATS, applyCommand, computeBuild, type GameEvent, type GameState } from '../src/core';
import { customMatch, fightToResult, ok, prepareBothAndBegin, testCreature } from './helpers';

const DICE1 = { sides: 1, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } };
const strong = testCreature('a', { power: 60, maxHp: 50 }, { dice: DICE1 });
const weak = testCreature('b', { power: 0, maxHp: 3 }, { dice: DICE1 });

/** P1 strong attacks P2 weak (plus a spare P2 so the match goes on), the battle is fought out. */
function battle(seed = 1): { s: GameState; events: GameEvent[] } {
  let s = customMatch({
    seed,
    creatures: [strong, weak],
    powerPoints: [{ x: 4, y: 4 }],
    placements: [
      { creature: 'a', owner: 'P1', x: 0, y: 0 },
      { creature: 'b', owner: 'P2', x: 1, y: 0 },
      { creature: 'b', owner: 'P2', x: 4, y: 0 },
    ],
  });
  s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 1, y: 0 } });
  s = fightToResult(prepareBothAndBegin(s));
  const r = applyCommand(s, { type: 'END_BATTLE' });
  if (r.error) throw new Error(r.error);
  return { s: r.state, events: r.events };
}

describe('levels', () => {
  it('every creature starts at level 1 with no bonuses', () => {
    const s = customMatch({ creatures: [strong, weak], placements: [{ creature: 'a', owner: 'P1', x: 0, y: 0 }, { creature: 'b', owner: 'P2', x: 4, y: 4 }] });
    for (const c of Object.values(s.creatures)) expect([c.level, c.bonus]).toEqual([1, {}]);
  });

  it('a creature that kills its opponent and survives goes up a level: +1 to two different stats', () => {
    const { s, events } = battle();
    const winner = s.creatures['P1-a-1'];
    expect(s.creatures['P2-b-1'].alive).toBe(false);
    expect(winner.level).toBe(2);
    const gains = Object.entries(winner.bonus);
    expect(gains).toHaveLength(2);
    for (const [stat, v] of gains) {
      expect(LEVEL_UP_STATS).toContain(stat);
      expect(v).toBe(1);
    }
    const ev = events.find((e) => e.type === 'LEVEL_UP');
    expect(ev).toMatchObject({ type: 'LEVEL_UP', creatureId: 'P1-a-1', level: 2 });
    expect(new Set(ev && ev.type === 'LEVEL_UP' ? ev.gains : []).size).toBe(2);
  });

  it('the bonuses count in every later battle (and in the build preview)', () => {
    const { s } = battle();
    const winner = s.creatures['P1-a-1'];
    const def = s.creatureDefs.a;
    const prep = { creatureId: winner.id, player: 'P1' as const, sides: 1, dice: [1, 1, 1, 1, 1], locked: [false, false, false, false, false], rollsUsed: 1, maxRolls: 3, stage: 'done' as const, slots: ['speed', 'power', 'shield', 'dash', 'block'].map((category) => ({ category })), slotDice: [0, 1, 2, 3, 4] };
    const plain = computeBuild(def, prep, s.ruleset);
    const levelled = computeBuild(def, prep, s.ruleset, winner.bonus);
    for (const stat of LEVEL_UP_STATS) expect(levelled.stats[stat] - plain.stats[stat]).toBe(winner.bonus[stat] ?? 0);
  });

  it('the same seed gives the same level-up (deterministic)', () => {
    expect(battle(7).s.creatures['P1-a-1'].bonus).toEqual(battle(7).s.creatures['P1-a-1'].bonus);
  });

  it('no level-up when nobody dies (timeout)', () => {
    // Timeout: two harmless creatures that never close in.
    const tame = testCreature('t', { power: 0, maxHp: 50 }, { dice: DICE1 });
    let s = customMatch({ creatures: [tame], placements: [{ creature: 't', owner: 'P1', x: 0, y: 0 }, { creature: 't', owner: 'P2', x: 1, y: 0 }, { creature: 't', owner: 'P2', x: 4, y: 0 }] });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-t-1', to: { x: 1, y: 0 } });
    s = prepareBothAndBegin(s);
    const idle = { dx: 0, dy: 0, attack: false, block: false };
    while (s.battle?.stage === 'combat') s = ok(s, { type: 'COMBAT_TICK', inputs: { attacker: idle, defender: idle } });
    expect(s.battle?.result?.outcome).toBe('TIMEOUT');
    const r = applyCommand(s, { type: 'END_BATTLE' });
    expect(r.events.some((e) => e.type === 'LEVEL_UP')).toBe(false);
    expect(Object.values(r.state.creatures).every((c) => c.level === 1)).toBe(true);
  });
});
