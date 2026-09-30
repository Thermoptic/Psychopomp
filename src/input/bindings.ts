// Default bindings. Plain data so remapping can later just replace this object
// (e.g. loaded from settings).

import type { PlayerId } from '../core/types';
import type { Action } from './actions';

/** KeyboardEvent.code -> action, per player. */
export type KeyboardBindings = Record<PlayerId, Record<string, Action>>;

/** Standard Gamepad API button index -> action. Applied to each player's pad. */
export type GamepadBindings = Record<number, Action>;

export interface InputBindings {
  keyboard: KeyboardBindings;
  gamepad: GamepadBindings;
  /** Left stick deadzone. */
  stickDeadzone: number;
  /** Gamepad index assigned to each player. */
  gamepadSlots: Record<PlayerId, number>;
}

export const DEFAULT_BINDINGS: InputBindings = {
  keyboard: {
    P1: {
      KeyW: 'move_up',
      KeyS: 'move_down',
      KeyA: 'move_left',
      KeyD: 'move_right',
      Space: 'confirm',
      ShiftLeft: 'cancel',
      KeyQ: 'previous',
      KeyE: 'next',
      KeyR: 'reroll',
      KeyF: 'lock_die',
      Digit1: 'die_1',
      Digit2: 'die_2',
      Digit3: 'die_3',
      Digit4: 'die_4',
      Digit5: 'die_5',
      Escape: 'pause',
    },
    P2: {
      ArrowUp: 'move_up',
      ArrowDown: 'move_down',
      ArrowLeft: 'move_left',
      ArrowRight: 'move_right',
      Enter: 'confirm',
      NumpadEnter: 'confirm',
      ShiftRight: 'cancel',
      Numpad0: 'cancel',
      Comma: 'previous',
      Period: 'next',
      NumpadAdd: 'reroll',
      Slash: 'reroll',
      NumpadDecimal: 'lock_die',
      Quote: 'lock_die',
      Numpad1: 'die_1',
      Numpad2: 'die_2',
      Numpad3: 'die_3',
      Numpad4: 'die_4',
      Numpad5: 'die_5',
      Backspace: 'pause',
    },
  },
  gamepad: {
    0: 'confirm', // A / Cross / B(Nintendo position)
    1: 'cancel',
    2: 'lock_die',
    3: 'reroll',
    4: 'previous',
    5: 'next',
    9: 'pause', // Start / Options / +
    12: 'move_up',
    13: 'move_down',
    14: 'move_left',
    15: 'move_right',
  },
  stickDeadzone: 0.5,
  gamepadSlots: { P1: 0, P2: 1 },
};
