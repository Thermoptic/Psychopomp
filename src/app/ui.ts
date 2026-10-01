// Presentation-only UI state for a match: cursor, selection, focus, timers.
// None of this affects gameplay; the GameState is the source of truth.

import type { BattleSide, Cell, PlayerId } from '../core/types';

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  ms: number;
}

/** One player's cursor in their own preparation panel. */
export interface PrepCursor {
  /** 0..dice-1 = dice rows, dice = the button. */
  row: number;
  col: 'die' | 'slot';
  /** Die picked up for placing. */
  held: number | null;
}

export function createPrepCursor(): PrepCursor {
  return { row: 0, col: 'die', held: null };
}

export interface MatchUi {
  cursor: Record<PlayerId, Cell>;
  selected: string | null;
  /** Mouse-hovered board cell. */
  hover: Cell | null;
  /** Independent preparation cursors: both players prepare at the same time. */
  prep: Record<PlayerId, PrepCursor>;
  /** "BATTLE!" banner after the countdown, in ms. */
  bannerMs: number;
  /** Battle intro emphasis on the board, in ms. */
  introMs: number;
  message: { text: string; color: string; ms: number } | null;
  paused: boolean;
  pauseFocus: number;
  pauseReason: string | null;
  flash: Record<BattleSide, number>;
  floaters: Floater[];
  /** Queued combat button presses, consumed by the next fixed tick. */
  queued: Record<BattleSide, { attack: boolean; block: boolean }>;
  debug: boolean;
}

export function createMatchUi(): MatchUi {
  return {
    cursor: { P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 } },
    selected: null,
    hover: null,
    prep: { P1: createPrepCursor(), P2: createPrepCursor() },
    bannerMs: 0,
    introMs: 0,
    message: null,
    paused: false,
    pauseFocus: 0,
    pauseReason: null,
    flash: { attacker: 0, defender: 0 },
    floaters: [],
    queued: { attacker: { attack: false, block: false }, defender: { attack: false, block: false } },
    debug: false,
  };
}
