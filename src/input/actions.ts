// Abstract input actions. The game never looks at physical keys or buttons —
// only at these actions, per player.

import { NO_AXES, type StickAxes } from './gamepad';

export const ACTIONS = [
  'move_up',
  'move_down',
  'move_left',
  'move_right',
  'confirm',
  'cancel',
  'pause',
  'reroll',
  'lock_die',
  'next',
  'previous',
  'die_1',
  'die_2',
  'die_3',
  'die_4',
  'die_5',
  // Combat (twin-stick): attack = Right Trigger, dash = Right Bumper, special = Left Trigger.
  'attack',
  'dash',
  'special',
] as const;

export type Action = (typeof ACTIONS)[number];

export interface ActionFrame {
  /** Currently held. */
  held: Set<Action>;
  /** Went down this frame. */
  pressed: Set<Action>;
  /** Pressed this frame or auto-repeating (for menu/cursor navigation). */
  repeat: Set<Action>;
  /** Analog sticks after the deadzone (-1..1). Zero for keyboard-only play. */
  axes: StickAxes;
  /** This player's gamepad is connected (keyboard players get auto-aim). */
  hasGamepad: boolean;
}

export function emptyFrame(): ActionFrame {
  return { held: new Set(), pressed: new Set(), repeat: new Set(), axes: { ...NO_AXES }, hasGamepad: false };
}
