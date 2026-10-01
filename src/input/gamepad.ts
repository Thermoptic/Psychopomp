// Pure gamepad reading: buttons -> abstract actions, sticks -> deadzoned axes.
// No browser globals, so it can be unit-tested with fake pads.
//
// Twin-stick layout (standard mapping):
//   left stick  -> movement (+ digital move_* actions for menus/board)
//   right stick -> aim
//   RT (7)      -> attack        LT (6) -> special
//   RB (5)      -> dash (+ next on the board)
//   LB (4)      -> previous on the board only; unused in combat

import type { Action } from './actions';
import type { InputBindings } from './bindings';

export interface StickAxes {
  /** -1..1 after the radial deadzone (0 inside the deadzone). */
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
}

export const NO_AXES: StickAxes = { moveX: 0, moveY: 0, aimX: 0, aimY: 0 };

/** Minimal shape of a Gamepad we read (matches the browser Gamepad API). */
export interface PadLike {
  connected: boolean;
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
  axes: ReadonlyArray<number>;
}

/**
 * Radial deadzone with rescaling: inside `dz` -> (0,0), outside the magnitude
 * is remapped to 0..1 so there is no jump at the deadzone edge and no jitter
 * near the centre.
 */
export function radialDeadzone(x: number, y: number, dz: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag <= dz || mag === 0) return { x: 0, y: 0 };
  const scaled = Math.min(1, (mag - dz) / (1 - dz));
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

export function readPad(pad: PadLike, b: InputBindings): { held: Set<Action>; axes: StickAxes } {
  const held = new Set<Action>();
  pad.buttons.forEach((btn, i) => {
    const mapped = b.gamepad[i];
    if (!mapped) return;
    const isTrigger = i === 6 || i === 7;
    const down = isTrigger ? btn.value >= b.triggerThreshold : btn.pressed;
    if (!down) return;
    for (const a of Array.isArray(mapped) ? mapped : [mapped]) held.add(a);
  });
  const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
  // Digital directions for menus / board cursor (unchanged behaviour).
  const dz = b.stickDeadzone;
  if (lx < -dz) held.add('move_left');
  if (lx > dz) held.add('move_right');
  if (ly < -dz) held.add('move_up');
  if (ly > dz) held.add('move_down');
  const move = radialDeadzone(lx, ly, b.analogDeadzone);
  const aim = radialDeadzone(rx, ry, b.analogDeadzone);
  return { held, axes: { moveX: move.x, moveY: move.y, aimX: aim.x, aimY: aim.y } };
}
