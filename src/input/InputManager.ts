// Browser input -> per-player abstract action frames. Keyboard and gamepads
// are merged: both players can always use their keyboard half, and gamepad N
// is assigned to a player via bindings.gamepadSlots.

import type { PlayerId } from '../core/types';
import { PLAYER_IDS } from '../core/types';
import { emptyFrame, type Action, type ActionFrame } from './actions';
import { DEFAULT_BINDINGS, type InputBindings } from './bindings';

const REPEATABLE: ReadonlySet<Action> = new Set(['move_up', 'move_down', 'move_left', 'move_right', 'next', 'previous']);
const REPEAT_DELAY_MS = 280;
const REPEAT_RATE_MS = 90;

export class InputManager {
  private keysDown = new Set<string>();
  /** Keys pressed since the last poll; a tap shorter than one frame still counts. */
  private keysTapped = new Set<string>();
  private prevHeld: Record<PlayerId, Set<Action>> = { P1: new Set(), P2: new Set() };
  private heldSince: Record<PlayerId, Map<Action, number>> = { P1: new Map(), P2: new Map() };
  private lastRepeat: Record<PlayerId, Map<Action, number>> = { P1: new Map(), P2: new Map() };
  private connectedPads = new Set<number>();
  /** Set when a gamepad assigned to a player disconnects; the app decides what to do. */
  onGamepadDisconnected: ((player: PlayerId | null) => void) | null = null;

  constructor(private bindings: InputBindings = DEFAULT_BINDINGS, target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (this.isBound(e.code)) e.preventDefault();
      this.keysDown.add(e.code);
      if (!e.repeat) this.keysTapped.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    target.addEventListener('blur', () => this.keysDown.clear());
    target.addEventListener('gamepadconnected', (e) => this.connectedPads.add((e as GamepadEvent).gamepad.index));
    target.addEventListener('gamepaddisconnected', (e) => {
      const index = (e as GamepadEvent).gamepad.index;
      this.connectedPads.delete(index);
      const player = PLAYER_IDS.find((p) => this.bindings.gamepadSlots[p] === index) ?? null;
      this.onGamepadDisconnected?.(player);
    });
  }

  setBindings(b: InputBindings): void {
    this.bindings = b;
  }

  gamepadCount(): number {
    return this.connectedPads.size;
  }

  private isBound(code: string): boolean {
    return PLAYER_IDS.some((p) => code in this.bindings.keyboard[p]);
  }

  private currentHeld(player: PlayerId): Set<Action> {
    const held = new Set<Action>();
    const map = this.bindings.keyboard[player];
    for (const code of [...this.keysDown, ...this.keysTapped]) {
      const a = map[code];
      if (a) held.add(a);
    }
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[this.bindings.gamepadSlots[player]];
    if (pad && pad.connected) {
      pad.buttons.forEach((b, i) => {
        const a = this.bindings.gamepad[i];
        if (a && b.pressed) held.add(a);
      });
      const dz = this.bindings.stickDeadzone;
      const [ax = 0, ay = 0] = pad.axes;
      if (ax < -dz) held.add('move_left');
      if (ax > dz) held.add('move_right');
      if (ay < -dz) held.add('move_up');
      if (ay > dz) held.add('move_down');
    }
    return held;
  }

  /** Call once per rendered frame. */
  poll(now: number): Record<PlayerId, ActionFrame> {
    const out = { P1: emptyFrame(), P2: emptyFrame() };
    for (const p of PLAYER_IDS) {
      const held = this.currentHeld(p);
      const frame = out[p];
      frame.held = held;
      for (const a of held) {
        if (!this.prevHeld[p].has(a)) {
          frame.pressed.add(a);
          frame.repeat.add(a);
          this.heldSince[p].set(a, now);
          this.lastRepeat[p].set(a, now);
        } else if (REPEATABLE.has(a)) {
          const since = this.heldSince[p].get(a) ?? now;
          const last = this.lastRepeat[p].get(a) ?? now;
          if (now - since >= REPEAT_DELAY_MS && now - last >= REPEAT_RATE_MS) {
            frame.repeat.add(a);
            this.lastRepeat[p].set(a, now);
          }
        }
      }
      this.prevHeld[p] = held;
    }
    this.keysTapped.clear();
    return out;
  }
}
