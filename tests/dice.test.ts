import { describe, expect, it } from 'vitest';
import { applyCommand, rerollsRemaining, type GameState } from '../src/core';
import { customMatch, ok, testCreature } from './helpers';

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

const prepOf = (s: GameState) => s.battle!.prep[s.battle!.preparing!];

describe('dice phase', () => {
  it('rolls five d6', () => {
    const s = ok(battleState(), { type: 'ROLL_DICE' });
    const prep = prepOf(s);
    expect(prep.dice).toHaveLength(5);
    for (const v of prep.dice) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(6);
    expect(prep.rollsUsed).toBe(1);
    expect(rerollsRemaining(prep)).toBe(2);
  });

  it('attacker prepares first; the defender cannot act out of turn', () => {
    const s = battleState();
    expect(s.battle!.preparing).toBe('attacker');
    expect(applyCommand(s, { type: 'ROLL_DICE', player: 'P2' }).error).toMatch(/P1/);
  });

  it('cannot lock before the first roll', () => {
    expect(applyCommand(battleState(), { type: 'LOCK_DIE', die: 0 }).error).toBeDefined();
  });

  it('locked dice are not rerolled; unlocked dice are', () => {
    // Search a few seeds so the check is not trivially satisfied by equal rolls.
    let changedSomewhere = false;
    for (let seed = 1; seed < 20; seed++) {
      let s = ok(battleState(seed), { type: 'ROLL_DICE' });
      const before = [...prepOf(s).dice];
      s = ok(s, { type: 'LOCK_DIE', die: 0 });
      s = ok(s, { type: 'LOCK_DIE', die: 2 });
      s = ok(s, { type: 'REROLL' });
      const after = prepOf(s).dice;
      expect(after[0]).toBe(before[0]);
      expect(after[2]).toBe(before[2]);
      if (after[1] !== before[1] || after[3] !== before[3] || after[4] !== before[4]) changedSomewhere = true;
    }
    expect(changedSomewhere).toBe(true);
  });

  it('unlock makes a die rerollable again', () => {
    let s = ok(battleState(), { type: 'ROLL_DICE' });
    s = ok(s, { type: 'LOCK_DIE', die: 1 });
    expect(prepOf(s).locked[1]).toBe(true);
    s = ok(s, { type: 'UNLOCK_DIE', die: 1 });
    expect(prepOf(s).locked[1]).toBe(false);
  });

  it('allows at most two rerolls, then moves to allocation', () => {
    let s = ok(battleState(), { type: 'ROLL_DICE' });
    s = ok(s, { type: 'REROLL' });
    expect(prepOf(s).stage).toBe('roll');
    s = ok(s, { type: 'REROLL' });
    expect(prepOf(s).rollsUsed).toBe(3);
    expect(prepOf(s).stage).toBe('allocate');
    expect(applyCommand(s, { type: 'REROLL' }).error).toBeDefined();
  });

  it('can stop early', () => {
    let s = ok(battleState(), { type: 'ROLL_DICE' });
    s = ok(s, { type: 'FINISH_ROLLING' });
    expect(prepOf(s).stage).toBe('allocate');
    expect(applyCommand(s, { type: 'LOCK_DIE', die: 0 }).error).toBeDefined();
  });

  it('rejects rerolling when every die is locked', () => {
    let s = ok(battleState(), { type: 'ROLL_DICE' });
    for (let i = 0; i < 5; i++) s = ok(s, { type: 'LOCK_DIE', die: i });
    expect(applyCommand(s, { type: 'REROLL' }).error).toMatch(/locked/);
  });
});

describe('dice allocation', () => {
  const allocating = () => ok(ok(battleState(), { type: 'ROLL_DICE' }), { type: 'FINISH_ROLLING' });

  it('allocates every die to a slot and confirms', () => {
    let s = allocating();
    for (let i = 0; i < 5; i++) s = ok(s, { type: 'ALLOCATE_DIE', die: i, slot: 4 - i });
    expect(prepOf(s).slotDice).toEqual([4, 3, 2, 1, 0]);
    s = ok(s, { type: 'CONFIRM_ALLOCATION' });
    expect(s.battle!.preparing).toBe('defender');
    expect(s.battle!.prep.attacker.stage).toBe('done');
  });

  it('rejects an incomplete allocation', () => {
    let s = allocating();
    s = ok(s, { type: 'ALLOCATE_DIE', die: 0, slot: 0 });
    const r = applyCommand(s, { type: 'CONFIRM_ALLOCATION' });
    expect(r.error).toMatch(/slot/);
    expect(r.state).toBe(s);
  });

  it('rejects placing a die in an occupied slot and invalid indices', () => {
    let s = allocating();
    s = ok(s, { type: 'ALLOCATE_DIE', die: 0, slot: 0 });
    expect(applyCommand(s, { type: 'ALLOCATE_DIE', die: 1, slot: 0 }).error).toMatch(/already/);
    expect(applyCommand(s, { type: 'ALLOCATE_DIE', die: 9, slot: 1 }).error).toBeDefined();
    expect(applyCommand(s, { type: 'ALLOCATE_DIE', die: 1, slot: 9 }).error).toBeDefined();
  });

  it('moving an allocated die to another slot never duplicates it', () => {
    let s = allocating();
    s = ok(s, { type: 'ALLOCATE_DIE', die: 0, slot: 0 });
    s = ok(s, { type: 'ALLOCATE_DIE', die: 0, slot: 3 });
    expect(prepOf(s).slotDice).toEqual([null, null, null, 0, null]);
    s = ok(s, { type: 'UNALLOCATE_DIE', slot: 3 });
    expect(prepOf(s).slotDice.every((d) => d === null)).toBe(true);
  });

  it('cannot allocate while still rolling', () => {
    const s = ok(battleState(), { type: 'ROLL_DICE' });
    expect(applyCommand(s, { type: 'ALLOCATE_DIE', die: 0, slot: 0 }).error).toBeDefined();
  });

  it('respects a custom dice layout from content', () => {
    const s0 = customMatch({
      creatures: [
        testCreature('a', {}, { dice: { slots: { power: 3, special: 2 } } }),
        testCreature('b'),
      ],
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'b', owner: 'P2', x: 1, y: 0 },
      ],
    });
    const s = ok(s0, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 1, y: 0 } });
    expect(s.battle!.prep.attacker.slots.map((x) => x.category)).toEqual(['power', 'power', 'power', 'special', 'special']);
  });
});
