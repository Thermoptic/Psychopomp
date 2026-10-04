// Turns one player's action frame into the core's per-tick FighterInput.
// Pure, so the twin-stick mapping is unit-testable.

import type { FighterInput } from '../core/types';
import type { ActionFrame } from './actions';

/** Button presses collected between fixed ticks, consumed by the next tick. */
export interface QueuedPresses {
  attack: boolean;
  block: boolean;
  dash: boolean;
  special: boolean;
}

export function emptyQueue(): QueuedPresses {
  return { attack: false, block: false, dash: false, special: false };
}

/** Records this frame's presses (edges) so none is lost between ticks. */
export function queuePresses(q: QueuedPresses, f: ActionFrame): void {
  if (f.pressed.has('attack') || f.pressed.has('confirm')) q.attack = true;
  if (f.pressed.has('cancel')) q.block = true;
  if (f.pressed.has('dash')) q.dash = true;
  if (f.pressed.has('special')) q.special = true;
}

const toAxis = (v: number) => Math.max(-100, Math.min(100, Math.round(v * 100)));

/**
 * @param autoAim aim used when the player has no gamepad (keyboard play):
 *                normally the direction to the opponent. Gamepad players keep
 *                their last right-stick aim instead.
 */
export function toFighterInput(f: ActionFrame, q: QueuedPresses, autoAim: { x: number; y: number } | null): FighterInput {
  // Movement: analog left stick if deflected, else the digital move actions (keyboard).
  let dx = toAxis(f.axes.moveX);
  let dy = toAxis(f.axes.moveY);
  if (dx === 0 && dy === 0) {
    dx = ((f.held.has('move_right') ? 1 : 0) - (f.held.has('move_left') ? 1 : 0)) * 100;
    dy = ((f.held.has('move_down') ? 1 : 0) - (f.held.has('move_up') ? 1 : 0)) * 100;
  }
  // Aim: right stick if deflected; otherwise keep (0,0) or auto-aim for keyboard players.
  let aimX = toAxis(f.axes.aimX);
  let aimY = toAxis(f.axes.aimY);
  if (aimX === 0 && aimY === 0 && !f.hasGamepad && autoAim) {
    aimX = autoAim.x;
    aimY = autoAim.y;
  }
  return {
    dx,
    dy,
    aimX,
    aimY,
    attack: q.attack,
    attackHeld: f.held.has('attack') || f.held.has('confirm'),
    block: q.block,
    dash: q.dash,
    special: q.special,
    specialHeld: f.held.has('special'),
  };
}

/** Integer aim vector (-100..100) pointing from `from` to `to`. */
export function aimToward(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const tx = to.x - from.x;
  const ty = to.y - from.y;
  const m = Math.max(Math.abs(tx), Math.abs(ty));
  if (m === 0) return { x: 0, y: 0 };
  return { x: Math.trunc((tx * 100) / m), y: Math.trunc((ty * 100) / m) };
}
