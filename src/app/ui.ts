// Presentation-only UI state for a match: cursor, selection, focus, timers.
// None of this affects gameplay; the GameState is the source of truth.

import type { BattleSide, Cell, PlayerId } from '../core/types';
import { emptyQueue, type QueuedPresses } from '../input/combatInput';

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
  /** Board -> arena expand transition when both players are READY, in ms. */
  arenaMs: number;
  /** Battle intro emphasis on the board, in ms. */
  introMs: number;
  message: { text: string; color: string; ms: number } | null;
  paused: boolean;
  pauseFocus: number;
  pauseReason: string | null;
  flash: Record<BattleSide, number>;
  floaters: Floater[];
  /** Projectile shockwaves being shown (combat units), purely visual. */
  impacts: Array<{ x: number; y: number; radius: number; ms: number; color: string }>;
  /** Recent positions (combat units) of each projectile in flight, by id, for trails. */
  trails: Record<number, Array<{ x: number; y: number }>>;
  /** Melee swishes being drawn (a fast arc in the swing's aim direction). */
  slashes: Array<{ side: BattleSide; ms: number; aim: { x: number; y: number } }>;
  /** Queued combat button presses, consumed by the next fixed tick. */
  queued: Record<BattleSide, QueuedPresses>;
  /** Right stick currently deflected (reticle highlighted). */
  aimActive: Record<BattleSide, boolean>;
  debug: boolean;
}

export function createMatchUi(): MatchUi {
  return {
    cursor: { P1: { x: 0, y: 0 }, P2: { x: 0, y: 0 } },
    selected: null,
    hover: null,
    prep: { P1: createPrepCursor(), P2: createPrepCursor() },
    bannerMs: 0,
    arenaMs: 0,
    introMs: 0,
    message: null,
    paused: false,
    pauseFocus: 0,
    pauseReason: null,
    flash: { attacker: 0, defender: 0 },
    floaters: [],
    impacts: [],
    slashes: [],
    trails: {},
    queued: { attacker: emptyQueue(), defender: emptyQueue() },
    aimActive: { attacker: false, defender: false },
    debug: false,
  };
}
