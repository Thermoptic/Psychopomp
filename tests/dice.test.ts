import { describe, expect, it } from 'vitest';
import { applyCommand, rerollsRemaining, type GameState } from '../src/core';
import { customMatch, ok, prepOf, testCreature } from './helpers';

/** P1-a-1 attacks P2-b-1; preparation is open for both. */
function battleState(seed = 7): GameState {
  const s = customMatch({
    seed,
    creatures: [testCreature('a'), testCreature('b')],
    placements: [
      { creature: 'a', owner: 'P1', x: 0, y: 0 },
      { creature: 'b', owner: 'P2', x: 1, y: 0 },
    ],
  });
  return ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 1, y: 0 } });
}

describe('dice phase', () => {
  it('both players receive five d6 when preparation starts', () => {
    const s = battleState();
    for (const p of ['P1', 'P2'] as const) {
      const prep = prepOf(s, p);
      expect(prep.dice).toHaveLength(5);
      for (const v of prep.dice) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(6);
      expect(prep.rollsUsed).toBe(1);
      expect(prep.stage).toBe('roll');
      expect(rerollsRemaining(prep)).toBe(2);
    }
  });

  it('dice commands must name a player in the battle', () => {
    const s = battleState();
    expect(applyCommand(s, { type: 'REROLL' } as never).error).toMatch(/name the player/);
  });

  it('locked dice are not rerolled; unlocked dice are', () => {
    let changedSomewhere = false;
    for (let seed = 1; seed < 20; seed++) {
      let s = battleState(seed);
      const before = [...prepOf(s, 'P1').dice];
      s = ok(s, { type: 'LOCK_DIE', die: 0, player: 'P1' });
      s = ok(s, { type: 'LOCK_DIE', die: 2, player: 'P1' });
      s = ok(s, { type: 'REROLL', player: 'P1' });
      const after = prepOf(s, 'P1').dice;
      expect(after[0]).toBe(before[0]);
      expect(after[2]).toBe(before[2]);
      if (after[1] !== before[1] || after[3] !== before[3] || after[4] !== before[4]) changedSomewhere = true;
    }
    expect(changedSomewhere).toBe(true);
  });

  it('unlock makes a die rerollable again', () => {
    let s = ok(battleState(), { type: 'LOCK_DIE', die: 1, player: 'P1' });
    expect(prepOf(s, 'P1').locked[1]).toBe(true);
    s = ok(s, { type: 'UNLOCK_DIE', die: 1, player: 'P1' });
    expect(prepOf(s, 'P1').locked[1]).toBe(false);
  });

  it('allows at most two rerolls, then moves to allocation', () => {
    let s = ok(battleState(), { type: 'REROLL', player: 'P1' });
    expect(prepOf(s, 'P1').stage).toBe('roll');
    s = ok(s, { type: 'REROLL', player: 'P1' });
    expect(prepOf(s, 'P1').rollsUsed).toBe(3);
    expect(prepOf(s, 'P1').stage).toBe('allocate');
    expect(applyCommand(s, { type: 'REROLL', player: 'P1' }).error).toBeDefined();
  });

  it('can stop rolling early', () => {
    const s = ok(battleState(), { type: 'FINISH_ROLLING', player: 'P1' });
    expect(prepOf(s, 'P1').stage).toBe('allocate');
    expect(applyCommand(s, { type: 'LOCK_DIE', die: 0, player: 'P1' }).error).toBeDefined();
  });

  it('placing the first die ends rolling (REROLL -> APPLY)', () => {
    const s = ok(battleState(), { type: 'ALLOCATE_DIE', die: 0, slot: 0, player: 'P1' });
    expect(prepOf(s, 'P1').stage).toBe('allocate');
    expect(applyCommand(s, { type: 'REROLL', player: 'P1' }).error).toBeDefined();
  });

  it('rejects rerolling when every die is locked', () => {
    let s = battleState();
    for (let i = 0; i < 5; i++) s = ok(s, { type: 'LOCK_DIE', die: i, player: 'P1' });
    expect(applyCommand(s, { type: 'REROLL', player: 'P1' }).error).toMatch(/locked/);
  });
});

describe('dice allocation', () => {
  it('allocates every die to a slot and confirms', () => {
    let s = battleState();
    for (let i = 0; i < 5; i++) s = ok(s, { type: 'ALLOCATE_DIE', die: i, slot: 4 - i, player: 'P1' });
    expect(prepOf(s, 'P1').slotDice).toEqual([4, 3, 2, 1, 0]);
    s = ok(s, { type: 'CONFIRM_ALLOCATION', player: 'P1' });
    expect(prepOf(s, 'P1').stage).toBe('done');
  });

  it('rejects an incomplete allocation', () => {
    const s = ok(battleState(), { type: 'ALLOCATE_DIE', die: 0, slot: 0, player: 'P1' });
    const r = applyCommand(s, { type: 'CONFIRM_ALLOCATION', player: 'P1' });
    expect(r.error).toMatch(/slot/);
    expect(r.state).toBe(s);
  });

  it('rejects placing a die in an occupied slot and invalid indices', () => {
    const s = ok(battleState(), { type: 'ALLOCATE_DIE', die: 0, slot: 0, player: 'P1' });
    expect(applyCommand(s, { type: 'ALLOCATE_DIE', die: 1, slot: 0, player: 'P1' }).error).toMatch(/already/);
    expect(applyCommand(s, { type: 'ALLOCATE_DIE', die: 9, slot: 1, player: 'P1' }).error).toBeDefined();
    expect(applyCommand(s, { type: 'ALLOCATE_DIE', die: 1, slot: 9, player: 'P1' }).error).toBeDefined();
  });

  it('moving an allocated die to another slot never duplicates it', () => {
    let s = ok(battleState(), { type: 'ALLOCATE_DIE', die: 0, slot: 0, player: 'P1' });
    s = ok(s, { type: 'ALLOCATE_DIE', die: 0, slot: 3, player: 'P1' });
    expect(prepOf(s, 'P1').slotDice).toEqual([null, null, null, 0, null]);
    s = ok(s, { type: 'UNALLOCATE_DIE', slot: 3, player: 'P1' });
    expect(prepOf(s, 'P1').slotDice.every((d) => d === null)).toBe(true);
  });

  it('respects a custom dice layout from content', () => {
    const s0 = customMatch({
      creatures: [testCreature('a', {}, { dice: { slots: { power: 3, special: 2 } } }), testCreature('b')],
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'b', owner: 'P2', x: 1, y: 0 },
      ],
    });
    const s = ok(s0, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 1, y: 0 } });
    expect(prepOf(s, 'P1').slots.map((x) => x.category)).toEqual(['power', 'power', 'power', 'special', 'special']);
  });
});
