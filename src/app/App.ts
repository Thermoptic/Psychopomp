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
import { focusedItem, combatHint, drawCombat, drawDiceScreen, drawResult, drawReveal } from '../rendering/battleView';
import { drawBoardScreen, drawHeader, drawMessageBar } from '../rendering/boardView';
import { rect, scanlines, type Ctx } from '../rendering/draw';
import { cellAtPoint, diceScreenRows, inRect, type DiceItem } from '../rendering/layout';
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
import { createMatchUi, type MatchUi } from './ui';

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
          this.ui.readyGate = true;
          this.ui.heldDie = null;
          this.ui.focus = { row: 1, col: 0 };
          this.say(`${a} ATTACKS ${d}!  BATTLE!`, C.danger, 1300);
          break;
        }
        case 'ALLOCATION_CONFIRMED':
          this.ui.readyGate = true;
          this.ui.heldDie = null;
          this.ui.focus = { row: 1, col: 0 };
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
        case 'HIT':
        case 'BLOCKED': {
          const target: BattleSide = e.type === 'HIT' ? (e.side === 'attacker' ? 'defender' : 'attacker') : e.side;
          const f = s.battle?.combat?.fighters[target];
          if (f) {
            if (e.type === 'HIT') this.ui.flash[target] = 260;
            this.ui.floaters.push({
              x: f.x,
              y: f.y - 40,
              text: e.type === 'HIT' ? `-${e.damage}` : 'BLOCK',
              color: e.type === 'HIT' ? C.danger : C.pp,
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
      case 'dice': {
        const prep = b.prep[b.preparing!];
        return this.diceInput(prep, f[prep.player]);
      }
      case 'reveal':
        if (this.any(f, 'confirm')) this.send({ type: 'BEGIN_COMBAT' });
        return;
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

  // --- dice ----------------------------------------------------------------------

  private diceInput(prep: DicePrep, f: ActionFrame): void {
    const ui = this.ui;
    if (ui.readyGate) {
      if (f.pressed.has('confirm')) {
        ui.readyGate = false;
        ui.focus = { row: 1, col: 0 };
        this.sfx.ui('confirm');
      }
      return;
    }
    const rows = diceScreenRows(prep);
    const dCol = (f.repeat.has('move_right') ? 1 : 0) - (f.repeat.has('move_left') ? 1 : 0);
    const dRow = (f.repeat.has('move_down') ? 1 : 0) - (f.repeat.has('move_up') ? 1 : 0);
    if (dCol || dRow) {
      const row = Math.max(0, Math.min(rows.length - 1, ui.focus.row + dRow));
      const col = Math.max(0, Math.min(rows[row].length - 1, (dRow ? Math.min(ui.focus.col, rows[row].length - 1) : ui.focus.col) + dCol));
      ui.focus = { row, col };
      this.sfx.ui('move');
    }
    const p = prep.player;
    for (let i = 0; i < 5; i++) {
      if (f.pressed.has(`die_${i + 1}` as Action) && i < prep.dice.length) this.activateDice(prep, { kind: 'die', i });
    }
    if (f.pressed.has('reroll') && prep.stage === 'roll') this.sendDice({ type: 'ROLL_DICE', player: p });
    if (f.pressed.has('lock_die')) {
      const it = focusedItem(prep, ui);
      if (it?.kind === 'die' && prep.stage === 'roll') this.activateDice(prep, it);
    }
    if (f.pressed.has('cancel')) {
      if (prep.stage === 'roll' && prep.rollsUsed > 0) this.sendDice({ type: 'FINISH_ROLLING', player: p });
      else if (prep.stage === 'allocate') ui.heldDie = null;
    }
    if (f.pressed.has('confirm')) {
      const it = focusedItem(prep, ui);
      if (it) this.activateDice(prep, it);
    }
  }

  /** Sends a dice command and fixes up focus after stage changes. */
  private sendDice(cmd: Command): boolean {
    const before = this.currentPrep()?.stage;
    const ok = this.send(cmd);
    const prep = this.currentPrep();
    if (ok && prep && before === 'roll' && prep.stage === 'allocate') {
      this.ui.heldDie = null;
      this.ui.focus = { row: 0, col: 0 };
    }
    return ok;
  }

  private currentPrep(): DicePrep | null {
    const b = this.state?.battle;
    return b && b.stage === 'dice' && b.preparing ? b.prep[b.preparing] : null;
  }

  private activateDice(prep: DicePrep, item: DiceItem): void {
    const p = prep.player;
    const ui = this.ui;
    if (item.kind === 'btn') {
      if (item.id === 'roll' || item.id === 'reroll') this.sendDice({ type: 'ROLL_DICE', player: p });
      else if (item.id === 'keep') this.sendDice({ type: 'FINISH_ROLLING', player: p });
      else if (item.id === 'clear') {
        prep.slotDice.forEach((d, slot) => d !== null && this.send({ type: 'UNALLOCATE_DIE', slot, player: p }));
        ui.heldDie = null;
      } else if (item.id === 'confirm') this.send({ type: 'CONFIRM_ALLOCATION', player: p });
      return;
    }
    if (item.kind === 'die') {
      if (prep.stage === 'roll') {
        if (prep.rollsUsed === 0) return void this.sendDice({ type: 'ROLL_DICE', player: p });
        this.send({ type: prep.locked[item.i] ? 'UNLOCK_DIE' : 'LOCK_DIE', die: item.i, player: p });
        return;
      }
      ui.heldDie = ui.heldDie === item.i ? null : item.i;
      if (ui.heldDie !== null) {
        const empty = prep.slotDice.indexOf(null);
        ui.focus = { row: 1, col: empty >= 0 ? empty : 0 };
        this.sfx.ui('confirm');
      }
      return;
    }
    // slot
    if (prep.stage !== 'allocate') return;
    const occupant = prep.slotDice[item.i];
    if (ui.heldDie !== null) {
      if (occupant !== null && occupant !== ui.heldDie) this.send({ type: 'UNALLOCATE_DIE', slot: item.i, player: p });
      if (occupant !== ui.heldDie) this.send({ type: 'ALLOCATE_DIE', die: ui.heldDie, slot: item.i, player: p });
      ui.heldDie = null;
      const after = this.currentPrep()!;
      const nextDie = after.dice.findIndex((_, i) => !after.slotDice.includes(i));
      ui.focus = nextDie >= 0 ? { row: 0, col: nextDie } : { row: 2, col: 1 };
    } else if (occupant !== null) {
      this.send({ type: 'UNALLOCATE_DIE', slot: item.i, player: p });
      ui.heldDie = occupant;
    } else {
      const free = prep.dice.findIndex((_, i) => !prep.slotDice.includes(i));
      if (free >= 0) ui.focus = { row: 0, col: free };
      this.say('PICK A DIE FIRST, THEN A SLOT', C.pp);
    }
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
      if (pf.pressed.has('confirm')) this.ui.queued[side].attack = true;
      if (pf.pressed.has('cancel')) this.ui.queued[side].block = true;
    }
    const step = 1000 / s.ruleset.combat.tickRate;
    this.acc = Math.min(this.acc + dtMs, step * 6);
    while (this.acc >= step && this.state?.battle?.stage === 'combat') {
      this.acc -= step;
      const inputs = {} as Record<BattleSide, FighterInput>;
      for (const side of ['attacker', 'defender'] as const) {
        const held = f[owner[side]].held;
        const q = this.ui.queued[side];
        inputs[side] = {
          dx: ((held.has('move_right') ? 1 : 0) - (held.has('move_left') ? 1 : 0)) as -1 | 0 | 1,
          dy: ((held.has('move_down') ? 1 : 0) - (held.has('move_up') ? 1 : 0)) as -1 | 0 | 1,
          attack: q.attack,
          block: q.block,
        };
        q.attack = false;
        q.block = false;
      }
      this.send({ type: 'COMBAT_TICK', inputs });
    }
    if (this.state?.battle?.stage !== 'combat') this.acc = 0;
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
    const prep = this.currentPrep();
    if (prep && !this.ui.readyGate) {
      diceScreenRows(prep).forEach((row, r) =>
        row.forEach((it, c) => {
          if (inRect(it.rect, x, y)) this.ui.focus = { row: r, col: c };
        }),
      );
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
    if (b.stage === 'reveal') this.send({ type: 'BEGIN_COMBAT' });
    else if (b.stage === 'result') this.send({ type: 'END_BATTLE' });
    else if (b.stage === 'dice') {
      const prep = b.prep[b.preparing!];
      if (this.ui.readyGate) {
        this.ui.readyGate = false;
        this.ui.focus = { row: 1, col: 0 };
        return;
      }
      for (const [r, row] of diceScreenRows(prep).entries()) {
        for (const [c, it] of row.entries()) {
          if (inRect(it.rect, x, y)) {
            this.ui.focus = { row: r, col: c };
            this.activateDice(prep, it.item);
            return;
          }
        }
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
        drawDiceScreen(ctx, s, ui);
        const who = playerLabel(b.prep[b.preparing!].player);
        drawMessageBar(ctx, ui.message && ui.message.ms > 0 ? ui.message.text : `${who} IS PREPARING`, ui.message && ui.message.ms > 0 ? ui.message.color : C.text);
      } else if (b.stage === 'reveal') {
        drawReveal(ctx, s);
        drawMessageBar(ctx, 'BOTH BUILDS ARE LOCKED IN');
      } else {
        drawCombat(ctx, s, ui, now);
        drawMessageBar(ctx, combatHint(s), C.dim);
        if (b.stage === 'result') drawResult(ctx, s);
      }
    }
    if (ui.paused) drawPause(ctx, ui);
    if (ui.debug) drawDebug(ctx, s, ui, this.fps);
  }
}
