// Dice preparation: roll, lock/unlock, reroll (max N), allocation to slots.
// All functions mutate the DicePrep draft passed in (applyCommand works on a
// cloned state) and throw RuleError for illegal actions.

import { rule } from '../errors';
import { rollDie } from '../rng';
import type { CreatureDef, DicePrep, DiceSlot, PlayerId, RngState, Ruleset, StatCategory } from '../types';
import { DEFAULT_CATEGORIES } from '../types';
import type { DiceView } from './requirements';

/** Category display order for a creature: explicit order, then defaults, then extras. */
export function categoryOrder(def: CreatureDef): StatCategory[] {
  const present = Object.keys(def.dice.slots).filter((c) => def.dice.slots[c] > 0);
  const base = def.dice.order ?? [...DEFAULT_CATEGORIES];
  const ordered = base.filter((c) => present.includes(c));
  return [...ordered, ...present.filter((c) => !ordered.includes(c))];
}

/** Expands a creature's slot counts into a flat slot list. */
export function buildSlots(def: CreatureDef): DiceSlot[] {
  const slots: DiceSlot[] = [];
  for (const category of categoryOrder(def)) {
    for (let i = 0; i < def.dice.slots[category]; i++) slots.push({ category });
  }
  return slots;
}

export function createDicePrep(creatureId: string, player: PlayerId, def: CreatureDef, rules: Ruleset): DicePrep {
  const n = rules.dice.count;
  const slots = buildSlots(def);
  return {
    creatureId,
    player,
    sides: def.dice.sides ?? rules.dice.sides,
    dice: new Array(n).fill(0),
    locked: new Array(n).fill(false),
    rollsUsed: 0,
    maxRolls: 1 + rules.dice.maxRerolls,
    stage: 'roll',
    slots,
    slotDice: new Array(slots.length).fill(null),
  };
}

/** Rerolls left after the first roll (before the first roll: all of them). */
export function rerollsRemaining(prep: DicePrep): number {
  return prep.rollsUsed === 0 ? prep.maxRolls - 1 : prep.maxRolls - prep.rollsUsed;
}

/** First roll rolls all dice; later rolls reroll only unlocked dice. */
export function roll(prep: DicePrep, rng: RngState): number[] {
  rule(prep.stage === 'roll', 'Dice are no longer being rolled');
  rule(prep.rollsUsed < prep.maxRolls, 'No rolls remaining');
  if (prep.rollsUsed > 0) {
    rule(prep.locked.some((l) => !l), 'All dice are locked - keep the dice instead');
  }
  for (let i = 0; i < prep.dice.length; i++) {
    if (prep.rollsUsed === 0 || !prep.locked[i]) prep.dice[i] = rollDie(rng, prep.sides);
  }
  prep.rollsUsed++;
  if (prep.rollsUsed >= prep.maxRolls) finishRolling(prep);
  return [...prep.dice];
}

export function setLocked(prep: DicePrep, die: number, locked: boolean): void {
  rule(prep.stage === 'roll', 'Dice can only be locked while rolling');
  rule(prep.rollsUsed > 0, 'Roll the dice first');
  rule(Number.isInteger(die) && die >= 0 && die < prep.dice.length, `No die #${die}`);
  prep.locked[die] = locked;
}

export function finishRolling(prep: DicePrep): void {
  rule(prep.stage === 'roll', 'Not rolling');
  rule(prep.rollsUsed > 0, 'Roll the dice first');
  prep.stage = 'allocate';
}

/** Places a die in an empty slot. A die already placed elsewhere is moved. */
export function allocate(prep: DicePrep, die: number, slot: number): void {
  rule(prep.stage === 'allocate', 'Not allocating dice');
  rule(Number.isInteger(die) && die >= 0 && die < prep.dice.length, `No die #${die}`);
  rule(Number.isInteger(slot) && slot >= 0 && slot < prep.slots.length, `No slot #${slot}`);
  rule(prep.slotDice[slot] === null, 'Slot already holds a die');
  const current = prep.slotDice.indexOf(die);
  if (current >= 0) prep.slotDice[current] = null;
  prep.slotDice[slot] = die;
}

export function unallocate(prep: DicePrep, slot: number): void {
  rule(prep.stage === 'allocate', 'Not allocating dice');
  rule(Number.isInteger(slot) && slot >= 0 && slot < prep.slots.length, `No slot #${slot}`);
  rule(prep.slotDice[slot] !== null, 'Slot is empty');
  prep.slotDice[slot] = null;
}

export function validateAllocation(prep: DicePrep): string | null {
  if (prep.stage !== 'allocate') return 'Not allocating dice';
  if (prep.slotDice.some((d) => d === null)) return 'Every slot needs a die';
  const used = new Set(prep.slotDice);
  if (used.size !== prep.slotDice.length) return 'A die is used twice';
  for (let i = 0; i < prep.dice.length; i++) if (!used.has(i)) return `Die #${i + 1} is not placed`;
  return null;
}

export function confirmAllocation(prep: DicePrep): void {
  const err = validateAllocation(prep);
  rule(err === null, err ?? '');
  prep.stage = 'done';
}

export function isAllocated(prep: DicePrep, die: number): boolean {
  return prep.slotDice.includes(die);
}

/** Groups the allocated dice by category (for stats and requirements). */
export function diceView(prep: DicePrep): DiceView {
  const byCategory: Record<StatCategory, number[]> = {};
  prep.slots.forEach((s, i) => {
    byCategory[s.category] ??= [];
    const d = prep.slotDice[i];
    if (d !== null) byCategory[s.category].push(prep.dice[d]);
  });
  return { all: prep.dice.filter((v) => v > 0), byCategory };
}
