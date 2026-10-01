// Menu, controls, pause, game-over, error and debug overlays.

import type { MatchUi } from '../app/ui';
import { getMovableCreatures, type GameState } from '../core';
import { badge, button, panel, rect, text, type Ctx } from './draw';
import type { Rect } from './layout';
import { drawCreature } from './sprites';
import { C, playerColor, VIEW_H, VIEW_W } from './theme';

export const MENU_ITEMS = ['NEW MATCH', 'CONTROLS'] as const;

export function menuItemRect(i: number): Rect {
  return { x: 480 - 130, y: 300 + i * 50, w: 260, h: 38 };
}

export function drawMenu(ctx: Ctx, focus: number, now: number): void {
  const t = now / 1000;
  drawCreature(ctx, 'glubber', 'P1', 220, 250 + Math.sin(t * 2) * 6, 12);
  drawCreature(ctx, 'shroud', 'P2', 740, 250 + Math.cos(t * 2) * 6, 12, { flip: true });
  text(ctx, 'PSYCHOPOMP', 483, 163, { size: 64, color: '#3a0d0a', align: 'center' });
  text(ctx, 'PSYCHOPOMP', 480, 160, { size: 64, color: C.danger, align: 'center' });
  text(ctx, 'BUILD YOUR MONSTER  ·  THEN FIGHT WITH WHAT YOU BUILT', 480, 200, { size: 13, color: C.dim, align: 'center' });
  MENU_ITEMS.forEach((label, i) => {
    button(ctx, menuItemRect(i), label, { focused: i === focus, size: 16 });
  });
  text(ctx, 'VERTICAL SLICE 0.1  ·  OFFLINE  ·  2 LOCAL PLAYERS', 480, 520, { size: 11, color: C.faint, align: 'center' });
}

export function drawControls(ctx: Ctx): void {
  const r = { x: 90, y: 40, w: 780, h: 460 };
  panel(ctx, r, C.pp);
  text(ctx, 'CONTROLS', 480, 80, { size: 24, color: C.pp, align: 'center' });
  const rows: Array<[string, string, string]> = [
    ['', 'PLAYER 1', 'PLAYER 2'],
    ['MOVE / NAVIGATE', 'W A S D', 'ARROW KEYS'],
    ['CONFIRM / ATTACK', 'SPACE', 'ENTER'],
    ['CANCEL / GUARD', 'LEFT SHIFT', 'RIGHT SHIFT / NUM 0'],
    ['REROLL', 'R', '/  or  NUM +'],
    ['LOCK DIE', 'F', "'  or  NUM ."],
    ['PICK DIE 1-5', '1 - 5', 'NUM 1 - 5'],
    ['DASH / SPECIAL', 'C  /  X', 'NUM *  /  NUM -'],
    ['PAUSE', 'ESC', 'BACKSPACE'],
    ['GAMEPAD (P1 = PAD 1, P2 = PAD 2)', '', ''],
    ['  COMBAT', 'L-STICK move   R-STICK aim', 'RT attack   RB dash   LT special'],
    ['  MENUS / DICE', 'A confirm   B cancel / guard', 'X lock   Y reroll   START pause'],
  ];
  rows.forEach(([a, b, c], i) => {
    const y = 122 + i * 26;
    const head = i === 0;
    text(ctx, a, 120, y, { size: 13, color: C.dim });
    text(ctx, b, 350, y, { size: head ? 15 : 13, color: head ? C.p1 : C.text });
    text(ctx, c, 610, y, { size: head ? 15 : 13, color: head ? C.p2 : C.text });
  });
  text(ctx, 'Mouse: click cells, dice, slots and buttons.  M: mute  ·  F3: debug', 480, 450, { size: 12, color: C.dim, align: 'center' });
  text(ctx, 'PRESS CONFIRM OR CANCEL TO RETURN', 480, 482, { size: 13, color: C.pp, align: 'center' });
}

export const PAUSE_ITEMS = ['RESUME', 'QUIT TO MENU'] as const;
export function pauseItemRect(i: number): Rect {
  return { x: 480 - 110, y: 250 + i * 48, w: 220, h: 36 };
}

export function drawPause(ctx: Ctx, ui: MatchUi): void {
  rect(ctx, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, 'rgba(0,0,0,0.7)');
  panel(ctx, { x: 300, y: 160, w: 360, h: 220 }, C.pp);
  text(ctx, 'PAUSED', 480, 205, { size: 24, color: C.pp, align: 'center' });
  if (ui.pauseReason) text(ctx, ui.pauseReason, 480, 232, { size: 12, color: C.danger, align: 'center' });
  PAUSE_ITEMS.forEach((l, i) => button(ctx, pauseItemRect(i), l, { focused: ui.pauseFocus === i }));
}

export function drawGameOver(ctx: Ctx, state: GameState): void {
  rect(ctx, { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, 'rgba(0,0,0,0.65)');
  const r = { x: 200, y: 140, w: 560, h: 250 };
  const winner = state.matchResult === 'PLAYER_1' ? 'P1' : state.matchResult === 'PLAYER_2' ? 'P2' : null;
  const color = playerColor(winner);
  panel(ctx, r, color);
  if (winner) badge(ctx, 480, 190, 22, winner, color);
  const title = winner ? `${winner === 'P1' ? 'PLAYER 1' : 'PLAYER 2'} WINS` : 'DRAW';
  text(ctx, title, 480, 250, { size: 36, color, align: 'center' });
  const reason =
    state.victoryReason === 'powerPoints'
      ? `ALL ${state.powerPoints.length} POWER POINTS CONTROLLED`
      : winner
        ? 'ALL ENEMY CREATURES DESTROYED'
        : 'NO CREATURES REMAIN';
  text(ctx, reason, 480, 285, { size: 15, align: 'center' });
  text(ctx, `TURN ${state.currentTurn.number}  ·  SEED ${state.rng.seed}`, 480, 312, { size: 11, color: C.dim, align: 'center' });
  text(ctx, 'PRESS CONFIRM FOR MAIN MENU', 480, 360, { size: 14, color: C.pp, align: 'center' });
}

export function drawError(ctx: Ctx, errors: string[]): void {
  panel(ctx, { x: 40, y: 40, w: 880, h: 460 }, C.danger);
  text(ctx, 'CONTENT ERROR', 70, 84, { size: 22, color: C.danger });
  errors.slice(0, 18).forEach((e, i) => text(ctx, e, 70, 120 + i * 20, { size: 12 }));
}

export function drawDebug(ctx: Ctx, state: GameState, ui: MatchUi, fps: number): void {
  const lines = [
    `seed ${state.rng.seed}  rng ${state.rng.state}`,
    `phase ${state.phase}  turn ${state.currentTurn.number} ${state.currentTurn.player}  result ${state.matchResult}`,
    `selected ${ui.selected ?? '-'}  movable ${getMovableCreatures(state).length}`,
    `battle ${state.battle ? `${state.battle.stage} att:${state.battle.prep.attacker.stage} def:${state.battle.prep.defender.stage} cd:${state.battle.countdown}` : '-'}`,
    state.battle?.combat ? `tick ${state.battle.combat.tick}` : '',
    `PP ${state.powerPoints.map((p) => p.owner ?? '-').join(' ')}`,
    `fps ${fps.toFixed(0)}`,
  ].filter(Boolean);
  rect(ctx, { x: 4, y: VIEW_H - 14 - lines.length * 13, w: 470, h: lines.length * 13 + 10 }, 'rgba(0,0,0,0.8)');
  lines.forEach((l, i) => text(ctx, l, 10, VIEW_H - 8 - (lines.length - 1 - i) * 13, { size: 11, color: C.ok, bold: false }));
}
