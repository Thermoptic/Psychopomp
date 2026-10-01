import { describe, expect, it } from 'vitest';
import { computeBuild, evaluateRequirement, type DicePrep, type Requirement } from '../src/core';
import { basePack } from './helpers';

// Requirements without a target look at the DASH slot (formerly SPECIAL).
const view = (all: number[], dash: number[] = all) => ({ all, byCategory: { dash } });
const ev = (req: Requirement, all: number[], special?: number[]) => evaluateRequirement(req, view(all, special));

describe('Special requirements', () => {
  it('AllOdd', () => {
    expect(ev({ type: 'allOdd' }, [], [1, 3])).toBe(true);
    expect(ev({ type: 'allOdd' }, [], [1, 4])).toBe(false);
    expect(ev({ type: 'allOdd' }, [], [])).toBe(false);
  });

  it('AllEven', () => {
    expect(ev({ type: 'allEven' }, [], [2, 6])).toBe(true);
    expect(ev({ type: 'allEven' }, [], [2, 5])).toBe(false);
  });

  it('targets all dice when asked', () => {
    expect(ev({ type: 'allOdd', target: 'all' }, [1, 3, 5, 1, 3], [2])).toBe(true);
    expect(ev({ type: 'allOdd', target: 'all' }, [1, 3, 5, 1, 4], [1])).toBe(false);
  });

  it('pattern predicates', () => {
    const all = (type: Requirement['type'], dice: number[]) => ev({ type, target: 'all' } as Requirement, dice);
    expect(all('pair', [1, 1, 2, 3, 4])).toBe(true);
    expect(all('pair', [1, 2, 3, 4, 5])).toBe(false);
    expect(all('twoPair', [1, 1, 2, 2, 4])).toBe(true);
    expect(all('twoPair', [1, 1, 2, 3, 4])).toBe(false);
    expect(all('threeOfKind', [5, 5, 5, 1, 2])).toBe(true);
    expect(all('fourOfKind', [5, 5, 5, 5, 2])).toBe(true);
    expect(all('fourOfKind', [5, 5, 5, 1, 2])).toBe(false);
    expect(all('fullHouse', [3, 3, 5, 5, 5])).toBe(true);
    expect(all('fullHouse', [3, 3, 5, 5, 1])).toBe(false);
    expect(all('straight', [2, 3, 4, 5, 6])).toBe(true);
    expect(all('straight', [2, 3, 4, 5, 5])).toBe(false);
    expect(all('allDifferent', [1, 2, 3, 4, 6])).toBe(true);
    expect(all('allDifferent', [1, 2, 3, 4, 4])).toBe(false);
    expect(ev({ type: 'straight', length: 4, target: 'all' }, [1, 2, 3, 4, 4])).toBe(true);
    expect(ev({ type: 'sumAtLeast', value: 20, target: 'all' }, [4, 4, 4, 4, 4])).toBe(true);
    expect(ev({ type: 'sumAtLeast', value: 21, target: 'all' }, [4, 4, 4, 4, 4])).toBe(false);
    expect(ev({ type: 'sumAtMost', value: 5, target: 'all' }, [1, 1, 1, 1, 1])).toBe(true);
  });

  it('AND / OR / NOT compose', () => {
    const odd: Requirement = { type: 'allOdd' };
    const high: Requirement = { type: 'sumAtLeast', value: 5 };
    expect(ev({ type: 'and', of: [odd, high] }, [], [5])).toBe(true);
    expect(ev({ type: 'and', of: [odd, high] }, [], [3])).toBe(false);
    expect(ev({ type: 'or', of: [odd, high] }, [], [3])).toBe(true);
    expect(ev({ type: 'not', of: odd }, [], [2])).toBe(true);
  });
});

describe('Special activation from content', () => {
  const pack = basePack();
  const glubber = pack.creatures.find((c) => c.id === 'glubber')!;
  const shroud = pack.creatures.find((c) => c.id === 'shroud')!;

  // Slots in default order: speed, power, shield, special, block.
  const prepWith = (dice: number[]): DicePrep => ({
    creatureId: 'x',
    player: 'P1',
    sides: 6,
    dice,
    locked: [false, false, false, false, false],
    rollsUsed: 1,
    maxRolls: 3,
    stage: 'done',
    slots: ['speed', 'power', 'shield', 'dash', 'block'].map((category) => ({ category })),
    slotDice: [0, 1, 2, 3, 4],
  });

  it('Glubber (ODD) activates with an odd die in SPECIAL and gains Power', () => {
    const on = computeBuild(glubber, prepWith([2, 6, 3, 5, 1]), pack.ruleset);
    expect(on.specialActive).toBe(true);
    // Base stats are 0: Power = the POWER die (6) + Odd Surge (4).
    expect(on.stats.power).toBe(6 + 4);
    const off = computeBuild(glubber, prepWith([2, 6, 3, 4, 1]), pack.ruleset);
    expect(off.specialActive).toBe(false);
    expect(off.stats.power).toBe(6);
  });

  it('Shroud (EVEN) activates with an even die in SPECIAL and gains Shield', () => {
    const on = computeBuild(shroud, prepWith([2, 6, 3, 4, 1]), pack.ruleset);
    expect(on.specialActive).toBe(true);
    expect(on.stats.shield).toBe(3 + 4);
    expect(computeBuild(shroud, prepWith([2, 6, 3, 5, 1]), pack.ruleset).specialActive).toBe(false);
  });

  it('dice add to base stats; the DASH die gives dash points', () => {
    const b = computeBuild(glubber, prepWith([2, 6, 3, 4, 1]), pack.ruleset);
    // Everything starts at 0; the placed dice give the values.
    expect(b.stats).toEqual({ speed: 2, power: 6, shield: 3, block: 1, dash: 4 });
    expect(b.diceByCategory).toEqual({ speed: 2, power: 6, shield: 3, dash: 4, block: 1 });
  });
});
