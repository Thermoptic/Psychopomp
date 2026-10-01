// What a player's preparation panel shows, derived purely from that player's
// DicePrep. No canvas, so it is unit-testable. Rules stay in the core: APPLY
// is enabled exactly when the core would accept CONFIRM_ALLOCATION.

import { rerollsRemaining, validateAllocation, type DicePrep, type Requirement } from '../core';

export type PrepButtonKind = 'reroll' | 'apply' | 'ready';

export interface PrepButton {
  kind: PrepButtonKind;
  label: string;
  enabled: boolean;
}

/** REROLL -> APPLY (disabled) -> APPLY (active) -> READY */
export function prepButton(prep: DicePrep): PrepButton {
  if (prep.stage === 'done') return { kind: 'ready', label: 'READY', enabled: false };
  if (prep.stage === 'roll') {
    const left = rerollsRemaining(prep);
    const canRoll = left > 0 && prep.locked.some((l) => !l);
    return { kind: 'reroll', label: `REROLL (${left})`, enabled: canRoll };
  }
  return { kind: 'apply', label: 'APPLY', enabled: validateAllocation(prep) === null };
}

export function prepPhaseLabel(prep: DicePrep): 'ROLLING' | 'PLACING' | 'READY' {
  return prep.stage === 'done' ? 'READY' : prep.stage === 'roll' ? 'ROLLING' : 'PLACING';
}

/** Very short requirement text that fits inside an empty Special slot. */
export function shortRequirement(req: Requirement): string {
  switch (req.type) {
    case 'allOdd':
    case 'anyOdd':
      return 'ODD';
    case 'allEven':
    case 'anyEven':
      return 'EVEN';
    case 'pair':
      return 'PAIR';
    case 'sumAtLeast':
      return `>=${req.value}`;
    case 'sumAtMost':
      return `<=${req.value}`;
    default:
      return '?';
  }
}
