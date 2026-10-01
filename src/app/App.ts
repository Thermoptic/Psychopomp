// Application controller: screen flow + turning abstract input actions into
// core Commands. It never changes GameState except through applyCommand.

import { Sfx } from '../audio/Sfx';
import type { ContentPack } from '../content/loader';
import {
  applyCommand,
  creatureAt,
  createMatch,
  getLegalMoves,
  getMovableCreatures,
  type BattleSide,
  type Cell,
  type Command,
  type DicePrep,
  type FighterInput,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '../core';
import type { Action, ActionFrame } from '../input/actions';
import { aimToward, emptyQueue, queuePresses, toFighterInput } from '../input/combatInput';
import { ARENA_EXPAND_MS, drawArena, drawCombatHud, drawCountdown } from '../rendering/arenaView';
import { combatHint, drawPrepPanel, drawResult, sideOf } from '../rendering/battleView';
import { drawBoard, drawBoardScreen, drawHeader, drawMessageBar } from '../rendering/boardView';
import { rect, scanlines, type Ctx } from '../rendering/draw';
import { cellAtPoint, inRect, prepItemAt, prepPanelLayout, type PrepItem } from '../rendering/layout';
import { prepButton } from '../rendering/prepModel';
import {
  MENU_ITEMS,
  PAUSE_ITEMS,
  drawControls,
  drawDebug,
  drawError,
  drawGameOver,
  drawMenu,
  drawPause,
  menuItemRect,
  pauseItemRect,
} from '../rendering/screens';
import { C, VIEW_H, VIEW_W, playerColor, playerLabel } from '../rendering/theme';
import { createMatchUi, createPrepCursor, type MatchUi } from './ui';

type Screen = 'menu' | 'controls' | 'match' | 'error';
type Frames = Record<PlayerId, ActionFrame>;

const MOVE_KEYS: Record<PlayerId, string> = { P1: 'WASD + SPACE', P2: 'ARROWS + ENTER' };

export class App {
  screen: Screen = 'menu';
  menuFocus = 0;
  state: GameState | null = null;
  ui: MatchUi = createMatchUi();
  private acc = 0;
  private fps = 60;

  constructor(
    private pack: ContentPack | null,
    private errors: string[],
    readonly sfx: Sfx,
  ) {
    if (!pack) this.screen = 'error';
  }

  // --- helpers ---------------------------------------------------------------

  private any(f: Frames, a: Action, kind: 'pressed' | 'repeat' = 'pressed'): boolean {
    return f.P1[kind].has(a) || f.P2[kind].has(a);
  }

  private say(text: string, color: string = C.text, ms = 2200): void {
    this.ui.message = { text, color, ms };
  }

  private deny(text: string): void {
    this.say(text, C.danger);
    this.sfx.ui('deny');
  }

  /** The only way the app changes game state. */
  private send(cmd: Command): boolean {
    if (!this.state) return false;
    const r = applyCommand(this.state, cmd);
    if (r.error) {
      this.deny(r.error.toUpperCase());
      return false;
    }
    this.state = r.state;
    this.sfx.handle(r.events);
    this.onEvents(r.events);
    return true;
  }

  newMatch(): void {
    if (!this.pack) return;
    // Seed comes from the platform clock; everything after it is deterministic.
    const seed = (Date.now() ^ (performance.now() * 1000)) >>> 0;
    this.state = createMatch({ ruleset: this.pack.ruleset, board: this.pack.boards[0], creatures: this.pack.creatures, seed });
    const debug = this.ui.debug;
    this.ui = createMatchUi();
    this.ui.debug = debug;
    for (const p of ['P1', 'P2'] as const) {
      const first = Object.values(this.state.creatures).find((c) => c.owner === p && c.alive);
      if (first) this.ui.cursor[p] = { x: first.x, y: first.y };
    }
    this.screen = 'match';
    this.say(`${playerLabel(this.state.currentTurn.player)} BEGINS`, playerColor(this.state.currentTurn.player));
  }

  private onEvents(events: GameEvent[]): void {
    const s = this.state!;
    for (const e of events) {
      switch (e.type) {
        case 'BATTLE_STARTED': {
          const a = s.creatureDefs[s.creatures[e.attackerId].defId].name.toUpperCase();
          const d = s.creatureDefs[s.creatures[e.defenderId].defId].name.toUpperCase();
          this.ui.selected = null;
          this.ui.introMs = 1300;
          // Fresh, independent preparation cursors for this battle.
          this.ui.prep = { P1: createPrepCursor(), P2: createPrepCursor() };
          this.acc = 0;
          this.say(`${a} ATTACKS ${d}!  BATTLE!`, C.danger, 1300);
          break;
        }
        case 'ALLOCATION_CONFIRMED':
          this.ui.prep[e.player].held = null;
          this.say(`${playerLabel(e.player)} IS READY`, playerColor(e.player), 1500);
          break;
        case 'COUNTDOWN_STARTED':
          // Both READY: switch to the wide combat arena before the 3-2-1.
          this.ui.arenaMs = ARENA_EXPAND_MS;
          break;
        case 'COMBAT_STARTED':
          this.ui.bannerMs = 700;
          this.ui.queued = { attacker: emptyQueue(), defender: emptyQueue() };
          break;
        case 'TURN_STARTED': {
          this.ui.selected = null;
          const cur = creatureAt(s, this.ui.cursor[e.player]);
          if (!cur || cur.owner !== e.player) {
            const first = Object.values(s.creatures).find((c) => c.alive && c.owner === e.player);
            if (first) this.ui.cursor[e.player] = { x: first.x, y: first.y };
          }
          break;
        }
        case 'POWER_POINT_CAPTURED':
          this.say(`${playerLabel(e.owner)} CAPTURES A POWER POINT`, playerColor(e.owner));
          break;
        case 'CREATURE_DIED': {
          const c = s.creatures[e.creatureId];
          this.say(`${s.creatureDefs[c.defId].name.toUpperCase()} (${playerLabel(c.owner)}) IS DESTROYED`, C.danger);
          break;
        }
        case 'DASH_DENIED': {
          const f = s.battle?.combat?.fighters[e.side];
          const label = e.reason === 'noDirection' ? 'NO DIR' : e.reason === 'blocked' ? 'BLOCKED' : 'COOLDOWN';
          if (f) this.ui.floaters.push({ x: f.x, y: f.y - 40, text: label, color: C.dim, ms: 600 });
          break;
        }
        case 'HIT':
        case 'DASH_HIT':
        case 'BLOCKED': {
          const target: BattleSide = e.type !== 'BLOCKED' ? (e.side === 'attacker' ? 'defender' : 'attacker') : e.side;
          const f = s.battle?.combat?.fighters[target];
          if (f) {
            if (e.type !== 'BLOCKED') this.ui.flash[target] = 260;
            this.ui.floaters.push({
              x: f.x,
              y: f.y - 40,
              text: e.type !== 'BLOCKED' ? `-${e.damage}` : 'BLOCK',
              color: e.type !== 'BLOCKED' ? C.danger : C.pp,
              ms: 800,
            });
          }
          break;
        }
      }
    }
  }

  // --- per-frame update -----------------------------------------------------

  frame(frames: Frames, dtMs: number): void {
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, dtMs)) * 0.05;
    const ui = this.ui;
    if (ui.message) ui.message.ms -= dtMs;
    ui.introMs = Math.max(0, ui.introMs - dtMs);
    ui.bannerMs = Math.max(0, ui.bannerMs - dtMs);
    ui.arenaMs = Math.max(0, ui.arenaMs - dtMs);
    ui.flash.attacker = Math.max(0, ui.flash.attacker - dtMs);
    ui.flash.defender = Math.max(0, ui.flash.defender - dtMs);
    ui.floaters = ui.floaters.filter((f) => (f.ms -= dtMs) > 0);

    switch (this.screen) {
      case 'menu':
        return this.menuInput(frames);
      case 'controls':
        if (this.any(frames, 'confirm') || this.any(frames, 'cancel') || this.any(frames, 'pause')) this.screen = 'menu';
        return;
      case 'error':
        return;
      case 'match':
        return this.matchInput(frames, dtMs);
    }
  }

  private menuInput(f: Frames): void {
    if (this.any(f, 'move_up', 'repeat')) this.menuFocus = (this.menuFocus + MENU_ITEMS.length - 1) % MENU_ITEMS.length;
    if (this.any(f, 'move_down', 'repeat')) this.menuFocus = (this.menuFocus + 1) % MENU_ITEMS.length;
    if (this.any(f, 'move_up', 'repeat') || this.any(f, 'move_down', 'repeat')) this.sfx.ui('move');
    if (this.any(f, 'confirm')) this.activateMenu(this.menuFocus);
  }

  private activateMenu(i: number): void {
    const item = MENU_ITEMS[i];
    if (item === 'NEW MATCH') {
      this.sfx.ui('confirm');
      this.newMatch();
    } else if (item === 'CONTROLS') {
      this.sfx.ui('confirm');
      this.screen = 'controls';
    } else this.sfx.ui('deny');
  }

  pause(reason: string | null = null): void {
    if (this.screen !== 'match' || !this.state || this.state.phase === 'gameOver') return;
    this.ui.paused = true;
    this.ui.pauseFocus = 0;
    this.ui.pauseReason = reason;
  }

  private activatePause(i: number): void {
    if (PAUSE_ITEMS[i] === 'RESUME') this.ui.paused = false;
    else {
      this.ui.paused = false;
      this.state = null;
      this.screen = 'menu';
    }
  }

  private matchInput(f: Frames, dtMs: number): void {
    const s = this.state!;
    const ui = this.ui;
    if (ui.paused) {
      if (this.any(f, 'move_up', 'repeat') || this.any(f, 'move_down', 'repeat')) ui.pauseFocus = 1 - ui.pauseFocus;
      if (this.any(f, 'confirm')) this.activatePause(ui.pauseFocus);
      if (this.any(f, 'pause') || this.any(f, 'cancel')) ui.paused = false;
      return;
    }
    if (this.any(f, 'pause') && s.phase !== 'gameOver') return this.pause();
    if (ui.introMs > 0) return;

    if (s.phase === 'gameOver') {
      if (this.any(f, 'confirm')) {
        this.state = null;
        this.screen = 'menu';
      }
      return;
    }
    if (s.phase === 'board') return this.boardInput(f[s.currentTurn.player]);

    const b = s.battle!;
    switch (b.stage) {
      case 'dice':
        // Both players prepare at the same time, each with their own input.
        this.prepInput('P1', f.P1);
        if (this.state?.battle?.stage === 'dice') this.prepInput('P2', f.P2);
        return;
      case 'countdown':
      case 'combat':
        return this.combatInput(f, dtMs);
      case 'result':
        if (this.any(f, 'confirm')) this.send({ type: 'END_BATTLE' });
        return;
    }
  }

  // --- board ------------------------------------------------------------------

  private boardInput(f: ActionFrame): void {
    const s = this.state!;
    const p = s.currentTurn.player;
    const cur = this.ui.cursor[p];
    const dx = (f.repeat.has('move_right') ? 1 : 0) - (f.repeat.has('move_left') ? 1 : 0);
    const dy = (f.repeat.has('move_down') ? 1 : 0) - (f.repeat.has('move_up') ? 1 : 0);
    if (dx || dy) {
      this.ui.cursor[p] = {
        x: Math.max(0, Math.min(s.board.width - 1, cur.x + dx)),
        y: Math.max(0, Math.min(s.board.height - 1, cur.y + dy)),
      };
      this.ui.hover = null;
      this.sfx.ui('move');
    }
    if (f.repeat.has('next') || f.repeat.has('previous')) {
      const movable = getMovableCreatures(s);
      if (movable.length) {
        const idx = movable.indexOf(this.ui.selected ?? '');
        const n = f.repeat.has('next') ? (idx + 1) % movable.length : (idx - 1 + movable.length) % movable.length;
        const c = s.creatures[movable[n]];
        this.ui.selected = c.id;
        this.ui.cursor[p] = { x: c.x, y: c.y };
        this.sfx.ui('move');
      }
    }
    if (f.pressed.has('cancel')) this.ui.selected = null;
    if (f.pressed.has('confirm')) this.boardConfirm(this.ui.cursor[p]);
  }

  private boardConfirm(cell: Cell): void {
    const s = this.state!;
    const p = s.currentTurn.player;
    const occupant = creatureAt(s, cell);
    if (this.ui.selected) {
      if (occupant?.id === this.ui.selected) {
        this.ui.selected = null;
        return;
      }
      const move = getLegalMoves(s, this.ui.selected).find((m) => m.x === cell.x && m.y === cell.y);
      if (move) {
        this.send({ type: 'MOVE_CREATURE', creatureId: this.ui.selected, to: cell, player: p });
        return;
      }
      if (occupant && occupant.owner === p) return this.select(occupant.id);
      return this.deny("CAN'T MOVE THERE");
    }
    if (occupant && occupant.owner === p) return this.select(occupant.id);
    if (getMovableCreatures(s).length === 0) {
      this.send({ type: 'PASS_TURN', player: p });
      return;
    }
    this.deny('SELECT ONE OF YOUR CREATURES');
  }

  private select(id: string): void {
    const s = this.state!;
    if (getLegalMoves(s, id).length === 0) return this.deny('THAT CREATURE HAS NO LEGAL MOVES');
    this.ui.selected = id;
    this.ui.message = null;
    this.sfx.ui('confirm');
  }

  boardHint(): string {
    const s = this.state!;
    const p = s.currentTurn.player;
    if (getMovableCreatures(s).length === 0) return `${playerLabel(p)}: NO LEGAL MOVES - PRESS CONFIRM TO PASS`;
    if (this.ui.selected) return `${playerLabel(p)}: MOVE TO A MARKED CELL (RED = ATTACK)  ·  CANCEL: DESELECT`;
    return `${playerLabel(p)}: SELECT A CREATURE (${MOVE_KEYS[p]}, Q/E CYCLE)`;
  }

  // --- preparation (both players simultaneously) -----------------------------------

  private prepOf(owner: PlayerId): DicePrep | null {
    const s = this.state;
    if (!s?.battle || s.battle.stage !== 'dice') return null;
    return s.battle.prep[sideOf(s, owner)];
  }

  /** One player's panel input. Never touches the other player's state. */
  private prepInput(owner: PlayerId, f: ActionFrame): void {
    const prep = this.prepOf(owner);
    if (!prep || prep.stage === 'done') return;
    const cur = this.ui.prep[owner];
    const n = prep.dice.length;
    // Rows 0..n-1 are dice rows, row n is the button.
    const dRow = (f.repeat.has('move_down') ? 1 : 0) - (f.repeat.has('move_up') ? 1 : 0);
    if (dRow) cur.row = Math.max(0, Math.min(n, cur.row + dRow));
    // Left/right follow the mirrored layout: P1 [die][slot], P2 [slot][die].
    const toSlot = owner === 'P1' ? 'move_right' : 'move_left';
    const toDie = owner === 'P1' ? 'move_left' : 'move_right';
    if (f.repeat.has(toSlot)) cur.col = 'slot';
    if (f.repeat.has(toDie)) cur.col = 'die';
    if (dRow || f.repeat.has(toSlot) || f.repeat.has(toDie)) this.sfx.ui('move');

    for (let i = 0; i < n && i < 5; i++) {
      if (f.pressed.has(`die_${i + 1}` as Action)) this.activatePrep(owner, { kind: 'die', i });
    }
    if (f.pressed.has('reroll')) this.activatePrep(owner, { kind: 'button' }, 'reroll');
    if (f.pressed.has('lock_die') && cur.row < n) this.activatePrep(owner, { kind: 'lock', i: cur.row });
    if (f.pressed.has('cancel')) cur.held = null;
    if (f.pressed.has('confirm')) {
      const item: PrepItem = cur.row >= n ? { kind: 'button' } : { kind: cur.col, i: cur.row };
      this.activatePrep(owner, item);
    }
  }

  private activatePrep(owner: PlayerId, item: PrepItem, only?: 'reroll'): void {
    const prep = this.prepOf(owner);
    if (!prep || prep.stage === 'done') return;
    const cur = this.ui.prep[owner];
    const player = owner;
    const n = prep.dice.length;
    if (item.kind === 'button') {
      if (!only) cur.row = n; // a hotkey does not move the cursor
      const btn = prepButton(prep);
      if (only && btn.kind !== only) return;
      if (btn.kind === 'reroll') {
        if (btn.enabled) this.send({ type: 'REROLL', player });
        else this.deny(`${playerLabel(owner)}: NO REROLL AVAILABLE`);
      } else if (btn.kind === 'apply') {
        if (btn.enabled) this.send({ type: 'CONFIRM_ALLOCATION', player });
        else this.deny(`${playerLabel(owner)}: PLACE EVERY DIE FIRST`);
      }
      return;
    }
    if (item.kind === 'lock') {
      if (prep.stage !== 'roll' || prep.slotDice.includes(item.i)) return;
      this.send({ type: prep.locked[item.i] ? 'UNLOCK_DIE' : 'LOCK_DIE', die: item.i, player });
      return;
    }
    if (item.kind === 'die') {
      cur.row = item.i;
      cur.col = 'die';
      const inSlot = prep.slotDice.indexOf(item.i);
      if (inSlot >= 0) {
        // Picking a placed die back up.
        this.send({ type: 'UNALLOCATE_DIE', slot: inSlot, player });
        cur.held = item.i;
      } else {
        cur.held = cur.held === item.i ? null : item.i;
      }
      if (cur.held !== null) {
        const empty = prep.slotDice.indexOf(null);
        if (empty >= 0) {
          cur.row = empty;
          cur.col = 'slot';
        }
        this.sfx.ui('confirm');
      }
      return;
    }
    // Slot
    cur.row = item.i;
    cur.col = 'slot';
    const occupant = prep.slotDice[item.i];
    if (cur.held !== null) {
      if (occupant !== null && occupant !== cur.held) this.send({ type: 'UNALLOCATE_DIE', slot: item.i, player });
      if (occupant !== cur.held) this.send({ type: 'ALLOCATE_DIE', die: cur.held, slot: item.i, player });
      cur.held = null;
      const after = this.prepOf(owner);
      if (!after) return;
      const next = after.dice.findIndex((_, i) => !after.slotDice.includes(i));
      if (next >= 0) {
        cur.row = next;
        cur.col = 'die';
      } else cur.row = n; // everything placed: jump to APPLY
    } else if (occupant !== null) {
      this.send({ type: 'UNALLOCATE_DIE', slot: item.i, player });
      cur.held = occupant;
    } else {
      const free = prep.dice.findIndex((_, i) => !prep.slotDice.includes(i));
      if (free >= 0) {
        cur.row = free;
        cur.col = 'die';
      }
      this.say(`${playerLabel(owner)}: PICK A DIE FIRST, THEN A SLOT`, C.pp);
    }
  }

  prepHint(): string {
    return 'P1: WASD + SPACE, F LOCK, R REROLL   ·   P2: ARROWS + ENTER, \' LOCK, / REROLL';
  }

  // --- combat -------------------------------------------------------------------

  private combatInput(f: Frames, dtMs: number): void {
    const s = this.state!;
    const b = s.battle!;
    const owner: Record<BattleSide, PlayerId> = {
      attacker: s.creatures[b.attackerId].owner,
      defender: s.creatures[b.defenderId].owner,
    };
    for (const side of ['attacker', 'defender'] as const) {
      const pf = f[owner[side]];
      queuePresses(this.ui.queued[side], pf);
      this.ui.aimActive[side] = pf.axes.aimX !== 0 || pf.axes.aimY !== 0;
    }
    const step = 1000 / s.ruleset.combat.tickRate;
    this.acc = Math.min(this.acc + dtMs, step * 6);
    const running = () => this.state?.battle?.stage === 'countdown' || this.state?.battle?.stage === 'combat';
    while (this.acc >= step && running()) {
      this.acc -= step;
      const inputs = {} as Record<BattleSide, FighterInput>;
      const combat = this.state?.battle?.combat ?? null;
      for (const side of ['attacker', 'defender'] as const) {
        // Keyboard players aim at the opponent automatically; gamepad players use the right stick.
        const me = combat?.fighters[side];
        const foe = combat?.fighters[side === 'attacker' ? 'defender' : 'attacker'];
        const autoAim = me && foe ? aimToward(me, foe) : null;
        inputs[side] = toFighterInput(f[owner[side]], this.ui.queued[side], autoAim);
        this.ui.queued[side] = emptyQueue();
      }
      this.send({ type: 'COMBAT_TICK', inputs });
    }
    if (!running()) this.acc = 0;
  }

  // --- mouse -------------------------------------------------------------------

  pointerMove(x: number, y: number): void {
    if (this.screen === 'menu') {
      MENU_ITEMS.forEach((_, i) => inRect(menuItemRect(i), x, y) && (this.menuFocus = i));
      return;
    }
    if (this.screen !== 'match' || !this.state) return;
    if (this.ui.paused) {
      PAUSE_ITEMS.forEach((_, i) => inRect(pauseItemRect(i), x, y) && (this.ui.pauseFocus = i));
      return;
    }
    if (this.state.phase === 'board') this.ui.hover = cellAtPoint(this.state.board, x, y);
    for (const owner of ['P1', 'P2'] as const) {
      const prep = this.prepOf(owner);
      if (!prep || prep.stage === 'done') continue;
      const it = prepItemAt(prepPanelLayout(owner, prep.dice.length), x, y);
      const cur = this.ui.prep[owner];
      if (it?.kind === 'button') cur.row = prep.dice.length;
      else if (it?.kind === 'die' || it?.kind === 'slot') {
        cur.row = it.i;
        cur.col = it.kind;
      }
    }
  }

  click(x: number, y: number): void {
    this.sfx.unlock();
    if (this.screen === 'menu') {
      MENU_ITEMS.forEach((_, i) => inRect(menuItemRect(i), x, y) && this.activateMenu(i));
      return;
    }
    if (this.screen === 'controls') {
      this.screen = 'menu';
      return;
    }
    if (this.screen !== 'match' || !this.state) return;
    const s = this.state;
    if (this.ui.paused) {
      PAUSE_ITEMS.forEach((_, i) => inRect(pauseItemRect(i), x, y) && this.activatePause(i));
      return;
    }
    if (this.ui.introMs > 0) return;
    if (s.phase === 'gameOver') {
      this.state = null;
      this.screen = 'menu';
      return;
    }
    if (s.phase === 'board') {
      const cell = cellAtPoint(s.board, x, y);
      if (cell) {
        this.ui.cursor[s.currentTurn.player] = cell;
        this.boardConfirm(cell);
      }
      return;
    }
    const b = s.battle!;
    if (b.stage === 'result') this.send({ type: 'END_BATTLE' });
    else if (b.stage === 'dice') {
      for (const owner of ['P1', 'P2'] as const) {
        const prep = this.prepOf(owner);
        if (!prep) continue;
        const it = prepItemAt(prepPanelLayout(owner, prep.dice.length), x, y);
        if (it) this.activatePrep(owner, it);
      }
    }
  }

  // --- render --------------------------------------------------------------------

  render(ctx: Ctx, now: number): void {
    rect(ctx, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, C.bg);
    switch (this.screen) {
      case 'menu':
        drawMenu(ctx, this.menuFocus, now);
        break;
      case 'controls':
        drawControls(ctx);
        break;
      case 'error':
        drawError(ctx, this.errors);
        break;
      case 'match':
        this.renderMatch(ctx, now);
        break;
    }
    scanlines(ctx, VIEW_W, VIEW_H);
  }

  private renderMatch(ctx: Ctx, now: number): void {
    const s = this.state!;
    const ui = this.ui;
    const b = s.battle;
    if (s.phase === 'board' || s.phase === 'gameOver' || ui.introMs > 0 || !b) {
      drawBoardScreen(ctx, s, ui, now, s.phase === 'board' ? this.boardHint() : '');
      if (s.phase === 'gameOver') drawGameOver(ctx, s);
    } else {
      drawHeader(ctx, s);
      if (b.stage === 'dice') {
        // Preparation: both panels live, combatants on the strategic board.
        drawPrepPanel(ctx, s, ui, 'P1');
        drawPrepPanel(ctx, s, ui, 'P2');
        drawBoard(ctx, s, ui, now);
        const msg = ui.message && ui.message.ms > 0 ? ui.message : null;
        drawMessageBar(ctx, msg ? msg.text : this.prepHint(), msg ? msg.color : C.dim);
      } else {
        // Both READY: wide combat arena + top HUD for countdown, combat and result.
        drawCombatHud(ctx, s);
        drawArena(ctx, s, ui, now, ui.arenaMs);
        if (ui.arenaMs <= 0) drawCountdown(ctx, s, ui);
        drawMessageBar(ctx, b.stage === 'countdown' ? 'BOTH READY - BATTLE STARTS' : combatHint(s), C.dim);
        if (b.stage === 'result') drawResult(ctx, s);
      }
    }
    if (ui.paused) drawPause(ctx, ui);
    if (ui.debug) drawDebug(ctx, s, ui, this.fps);
  }
}
