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

export interface MatchUi {
  cursor: Record<PlayerId, Cell>;
  selected: string | null;
  /** Mouse-hovered board cell. */
  hover: Cell | null;
  /** Focus on the dice screen (row/col into diceScreenRows). */
  focus: { row: number; col: number };
  /** Die picked up for allocation. */
  heldDie: number | null;
  /** The preparing player must confirm before their dice are shown (hot-seat privacy). */
  readyGate: boolean;
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
    focus: { row: 1, col: 0 },
    heldDie: null,
    readyGate: true,
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
