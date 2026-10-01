// Data-driven Special requirement engine. A requirement is plain data (see
// Requirement in types.ts); this module evaluates and describes it. No creature
// is ever referenced here.

import type { DiceTarget, Requirement, SlotCondition, StatCategory } from '../types';

/** Final dice of a build, grouped for requirement evaluation. */
export interface DiceView {
  all: number[];
  byCategory: Record<StatCategory, number[]>;
  /** Die value per dice slot in layout order (0 = slot empty). */
  bySlot?: number[];
}

export const REQUIREMENT_TYPES = [
  'always',
  'never',
  'allOdd',
  'allEven',
  'anyOdd',
  'anyEven',
  'pair',
  'twoPair',
  'threeOfKind',
  'fourOfKind',
  'fullHouse',
  'straight',
  'sumAtLeast',
  'sumAtMost',
  'allDifferent',
  'and',
  'or',
  'not',
  'slots',
] as const;

/** Does one die value satisfy a slot condition? */
export function slotConditionMet(cond: SlotCondition, value: number): boolean {
  if (!value) return false;
  if (cond === 'odd') return value % 2 === 1;
  if (cond === 'even') return value % 2 === 0;
  return value === cond;
}

/** Requirements without a target look at the DASH slot (formerly SPECIAL). */
const DEFAULT_TARGET: DiceTarget = 'dash';

function pick(view: DiceView, target: DiceTarget | undefined): number[] {
  const t = target ?? DEFAULT_TARGET;
  return t === 'all' ? view.all : view.byCategory[t] ?? [];
}

/** Counts of each face, sorted descending, e.g. [3,3,5,5,5] -> [3,2]. */
function groupSizes(dice: number[]): number[] {
  const counts = new Map<number, number>();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.values()].sort((a, b) => b - a);
}

function longestRun(dice: number[]): number {
  const uniq = [...new Set(dice)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < uniq.length; i++) {
    run = i > 0 && uniq[i] === uniq[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export function evaluateRequirement(req: Requirement, view: DiceView): boolean {
  switch (req.type) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'and':
      return req.of.every((r) => evaluateRequirement(r, view));
    case 'or':
      return req.of.some((r) => evaluateRequirement(r, view));
    case 'not':
      return !evaluateRequirement(req.of, view);
    case 'slots': {
      // Unused slots (null) require nothing; all used ones must hold.
      const active = req.slots.map((c, i) => [c, i] as const).filter(([c]) => c !== null);
      if (active.length === 0) return false;
      return active.every(([c, i]) => slotConditionMet(c as SlotCondition, view.bySlot?.[i] ?? 0));
    }
  }

  const dice = pick(view, req.target);
  if (dice.length === 0) return false;
  const groups = groupSizes(dice);
  const sum = dice.reduce((a, b) => a + b, 0);

  switch (req.type) {
    case 'allOdd':
      return dice.every((d) => d % 2 === 1);
    case 'allEven':
      return dice.every((d) => d % 2 === 0);
    case 'anyOdd':
      return dice.some((d) => d % 2 === 1);
    case 'anyEven':
      return dice.some((d) => d % 2 === 0);
    case 'pair':
      return groups[0] >= 2;
    case 'twoPair':
      return groups.filter((g) => g >= 2).length >= 2 || groups[0] >= 4;
    case 'threeOfKind':
      return groups[0] >= 3;
    case 'fourOfKind':
      return groups[0] >= 4;
    case 'fullHouse':
      return groups.length === 2 && groups[0] === 3 && groups[1] === 2;
    case 'allDifferent':
      return groups[0] === 1;
    case 'straight':
      return longestRun(dice) >= (req.length ?? dice.length);
    case 'sumAtLeast':
      return sum >= req.value;
    case 'sumAtMost':
      return sum <= req.value;
  }
}

function targetLabel(t: DiceTarget | undefined): string {
  const x = t ?? DEFAULT_TARGET;
  return x === 'all' ? 'ALL DICE' : x.toUpperCase();
}

export function slotConditionLabel(c: SlotCondition): string {
  return c === 'odd' ? 'ODD' : c === 'even' ? 'EVEN' : String(c);
}

/** Short human-readable text, e.g. "SPECIAL: ALL ODD". Used by UI and editor. */
export function describeRequirement(req: Requirement): string {
  switch (req.type) {
    case 'always':
      return 'ALWAYS';
    case 'never':
      return 'NEVER';
    case 'and':
      return req.of.map(describeRequirement).join(' AND ');
    case 'or':
      return req.of.map(describeRequirement).join(' OR ');
    case 'not':
      return `NOT (${describeRequirement(req.of)})`;
    case 'slots': {
      const parts = req.slots.map((c, i) => (c === null ? null : `S${i + 1} ${slotConditionLabel(c)}`)).filter(Boolean);
      return parts.length ? parts.join(' · ') : 'NO TRIGGER';
    }
  }
  const t = targetLabel(req.target);
  switch (req.type) {
    case 'allOdd':
      return `${t}: ALL ODD`;
    case 'allEven':
      return `${t}: ALL EVEN`;
    case 'anyOdd':
      return `${t}: ANY ODD`;
    case 'anyEven':
      return `${t}: ANY EVEN`;
    case 'pair':
      return `${t}: PAIR`;
    case 'twoPair':
      return `${t}: TWO PAIR`;
    case 'threeOfKind':
      return `${t}: THREE OF A KIND`;
    case 'fourOfKind':
      return `${t}: FOUR OF A KIND`;
    case 'fullHouse':
      return `${t}: FULL HOUSE`;
    case 'allDifferent':
      return `${t}: ALL DIFFERENT`;
    case 'straight':
      return `${t}: STRAIGHT${req.length ? ' ' + req.length : ''}`;
    case 'sumAtLeast':
      return `${t}: SUM >= ${req.value}`;
    case 'sumAtMost':
      return `${t}: SUM <= ${req.value}`;
  }
}
