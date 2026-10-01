// Board screen: header, player panels, the tactical grid and the message bar.
// Legal moves are *queried* from the core; nothing here decides legality.

import type { MatchUi } from '../app/ui';
import { creatureAt, describeRequirement, getLegalMoves, livingCreatures, type GameState, type PlayerId } from '../core';
import { badge, hpBar, panel, rect, strokeRect, text, wrapText, type Ctx } from './draw';
import { HEADER, LEFT_PANEL, MESSAGE_BAR, RIGHT_PANEL, boardLayout, cellRect, type BoardLayout, type Rect } from './layout';
import { boardUnits, combatToScreen, isBattleView, isCombatView, type BoardUnit } from './boardUnits';
import { drawCreature } from './sprites';
import { C, playerColor, playerLabel } from './theme';

export function drawHeader(ctx: Ctx, state: GameState): void {
  panel(ctx, HEADER, undefined, '#101015');
  text(ctx, 'PSYCHOPOMP', 18, 29, { size: 22, color: C.text });
  text(ctx, 'PSYCHOPOMP', 17, 28, { size: 22, color: C.danger });

  const p = state.currentTurn.player;
  const label = state.phase === 'gameOver' ? 'MATCH OVER' : `TURN ${state.currentTurn.number}  ·  ${playerLabel(p)}`;
  badge(ctx, 480 - 110, 22, 14, p, playerColor(p));
  text(ctx, label, 480 - 96, 27, { size: 16, color: playerColor(p) });

  const count = (o: PlayerId) => state.powerPoints.filter((pp) => pp.owner === o).length;
  const total = state.powerPoints.length;
  text(ctx, 'POWER', 760, 20, { size: 10, color: C.dim });
  text(ctx, 'POINTS', 760, 32, { size: 10, color: C.dim });
  badge(ctx, 820, 22, 12, 'P1', C.p1);
  text(ctx, `${count('P1')}/${total}`, 832, 27, { size: 15, color: C.p1 });
  badge(ctx, 890, 22, 12, 'P2', C.p2);
  text(ctx, `${count('P2')}/${total}`, 902, 27, { size: 15, color: C.p2 });
}

function statLine(ctx: Ctx, x: number, y: number, label: string, value: string, color: string = C.text): void {
  text(ctx, label, x, y, { size: 12, color: C.dim });
  text(ctx, value, x + 90, y, { size: 14, color });
}

/** Chooses which creature a player's panel shows: hovered, selected, else first alive. */
function panelCreature(state: GameState, ui: MatchUi, player: PlayerId): string | null {
  const look = ui.hover ?? (state.currentTurn.player === player ? ui.cursor[player] : null);
  if (look) {
    const c = creatureAt(state, look);
    if (c && c.owner === player) return c.id;
  }
  if (ui.selected && state.creatures[ui.selected]?.owner === player) return ui.selected;
  return livingCreatures(state, player)[0]?.id ?? null;
}

export function drawPlayerPanel(ctx: Ctx, state: GameState, ui: MatchUi, player: PlayerId, r: Rect): void {
  const color = playerColor(player);
  const active = state.currentTurn.player === player && state.phase === 'board';
  panel(ctx, r, color);
  badge(ctx, r.x + 20, r.y + 22, 14, player, color);
  text(ctx, playerLabel(player), r.x + 34, r.y + 27, { size: 16, color });
  if (active) text(ctx, 'TO MOVE', r.x + r.w - 14, r.y + 27, { size: 11, color: C.pp, align: 'right' });

  const id = panelCreature(state, ui, player);
  let y = r.y + 44;
  if (id) {
    const cr = state.creatures[id];
    const def = state.creatureDefs[cr.defId];
    rect(ctx, { x: r.x + 12, y, w: 84, h: 84 }, '#0c0c10');
    strokeRect(ctx, { x: r.x + 12, y, w: 84, h: 84 }, C.faint, 2);
    drawCreature(ctx, def.id, player, r.x + 54, y + 42, 7);
    text(ctx, def.name.toUpperCase(), r.x + 106, y + 16, { size: 15, color: C.text });
    text(ctx, 'HP', r.x + 106, y + 38, { size: 11, color: C.dim });
    text(ctx, `${cr.hp}/${def.stats.maxHp}`, r.x + r.w - 14, y + 38, { size: 14, color: cr.hp < def.stats.maxHp ? C.danger : C.text, align: 'right' });
    hpBar(ctx, { x: r.x + 106, y: y + 44, w: r.w - 120, h: 10 }, cr.hp, def.stats.maxHp, color);
    text(ctx, cr === state.creatures[ui.selected ?? ''] ? 'SELECTED' : '', r.x + 106, y + 74, { size: 11, color: C.pp });
    y += 106;
    statLine(ctx, r.x + 14, y, 'MOVEMENT', String(def.stats.movement));
    statLine(ctx, r.x + 14, (y += 20), 'POWER', String(def.stats.power));
    statLine(ctx, r.x + 14, (y += 20), 'SPEED', String(def.stats.speed));
    statLine(ctx, r.x + 14, (y += 20), 'SHIELD', String(def.stats.shield));
    y += 26;
    if (def.special) {
      text(ctx, 'SPECIAL', r.x + 14, y, { size: 11, color: C.dim });
      text(ctx, def.special.name.toUpperCase(), r.x + 76, y, { size: 13, color: C.pp });
      y = wrapText(ctx, describeRequirement(def.special.requirement), r.x + 14, y + 18, r.w - 28, { size: 11, color: C.text });
      if (def.special.description) y = wrapText(ctx, def.special.description, r.x + 14, y, r.w - 28, { size: 11, color: C.dim });
    }
  }

  // Roster
  const roster = Object.values(state.creatures).filter((c) => c.owner === player);
  let ry = r.y + r.h - 16 - roster.length * 18;
  text(ctx, 'ROSTER', r.x + 14, ry - 8, { size: 10, color: C.dim });
  for (const c of roster) {
    const def = state.creatureDefs[c.defId];
    const col = c.alive ? C.text : C.faint;
    text(ctx, c.alive ? def.name.toUpperCase() : `${def.name.toUpperCase()} (DEAD)`, r.x + 14, ry + 10, { size: 11, color: col });
    if (c.alive) hpBar(ctx, { x: r.x + 124, y: ry + 2, w: r.w - 138, h: 8 }, c.hp, def.stats.maxHp, color);
    ry += 18;
  }
}

export function drawBoard(ctx: Ctx, state: GameState, ui: MatchUi, now: number, battleView = isBattleView(state)): void {
  const board = state.board;
  const l = boardLayout(board);
  panel(ctx, { x: l.ox - 10, y: l.oy - 10, w: l.cell * board.width + 20, h: l.cell * board.height + 20 });

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const r = cellRect(l, { x, y });
      rect(ctx, r, (x + y) % 2 === 0 ? C.cellA : C.cellB);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    }
  }
  for (const b of board.blockedCells) {
    const r = cellRect(l, b);
    rect(ctx, r, '#050506');
    ctx.strokeStyle = C.rust;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x + 6, r.y + 6);
    ctx.lineTo(r.x + r.w - 6, r.y + r.h - 6);
    ctx.moveTo(r.x + r.w - 6, r.y + 6);
    ctx.lineTo(r.x + 6, r.y + r.h - 6);
    ctx.stroke();
  }

  // Power Points: glyph + owner label (not colour alone).
  for (const pp of state.powerPoints) {
    const r = cellRect(l, pp);
    const col = pp.owner ? playerColor(pp.owner) : C.pp;
    ctx.fillStyle = pp.owner ? (pp.owner === 'P1' ? 'rgba(242,180,65,0.14)' : 'rgba(179,92,255,0.16)') : 'rgba(57,224,200,0.10)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    strokeRect(ctx, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, col, 2);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r.h / 2 + 6);
    ctx.lineTo(cx + r.w / 2 - 6, cy);
    ctx.lineTo(cx, cy + r.h / 2 - 6);
    ctx.lineTo(cx - r.w / 2 + 6, cy);
    ctx.closePath();
    ctx.stroke();
    text(ctx, pp.owner ? (pp.owner === 'P1' ? '1' : '2') : '-', r.x + r.w - 6, r.y + r.h - 5, { size: 10, color: col, align: 'right' });
  }

  // Legal moves of the selected creature (queried from the core).
  if (state.phase === 'board' && ui.selected) {
    for (const m of getLegalMoves(state, ui.selected)) {
      const r = cellRect(l, m);
      ctx.fillStyle = m.attacks ? C.attack : C.legal;
      ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      if (!m.attacks) {
        ctx.fillStyle = C.pp;
        ctx.fillRect(r.x + r.w / 2 - 2, r.y + r.h / 2 - 2, 4, 4);
      }
    }
  }

  // Battle emphasis (board mode only; in combat mode the board is cleared).
  const b = state.battle;
  const pulse = Math.floor(now / 150) % 2 === 0;
  if (b && !battleView) {
    for (const c of [b.from, b.cell]) {
      const r = cellRect(l, c);
      strokeRect(ctx, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, pulse ? C.danger : '#ffd0c8', 3);
    }
  }

  // Creatures: all living ones in board mode, only the two combatants on
  // their spawn cells during preparation.
  drawUnits(ctx, state, ui, l, boardUnits(state, l, battleView), now);

  // Cursor of the player to move.
  if (state.phase === 'board') {
    const p = state.currentTurn.player;
    const r = cellRect(l, ui.cursor[p]);
    ctx.fillStyle = playerColor(p);
    const k = 10;
    for (const [x, y, w, h] of [
      [r.x - 2, r.y - 2, k, 3], [r.x - 2, r.y - 2, 3, k],
      [r.x + r.w - k + 2, r.y - 2, k, 3], [r.x + r.w - 1, r.y - 2, 3, k],
      [r.x - 2, r.y + r.h - 1, k, 3], [r.x - 2, r.y + r.h - k + 2, 3, k],
      [r.x + r.w - k + 2, r.y + r.h - 1, k, 3], [r.x + r.w - 1, r.y + r.h - k + 2, 3, k],
    ]) ctx.fillRect(x, y, w, h);
  }
}

export function drawMessageBar(ctx: Ctx, msg: string, color: string = C.text): void {
  panel(ctx, MESSAGE_BAR, undefined, '#0e0e12');
  text(ctx, msg, MESSAGE_BAR.x + 18, MESSAGE_BAR.y + 28, { size: 14, color });
}

/** Plain board mode (also used for the short battle intro). */
export function drawBoardScreen(ctx: Ctx, state: GameState, ui: MatchUi, now: number, hint: string): void {
  drawHeader(ctx, state);
  drawPlayerPanel(ctx, state, ui, 'P1', LEFT_PANEL);
  drawPlayerPanel(ctx, state, ui, 'P2', RIGHT_PANEL);
  drawBoard(ctx, state, ui, now, false);
  if (ui.message && ui.message.ms > 0) drawMessageBar(ctx, ui.message.text, ui.message.color);
  else drawMessageBar(ctx, hint, playerColor(state.currentTurn.player));
}

/**
 * Draws creatures at board-sprite scale on any grid layout (strategic board or
 * combat arena), including combat indicators and damage numbers.
 */
export function drawUnits(ctx: Ctx, state: GameState, ui: MatchUi, l: BoardLayout, units: BoardUnit[], now: number): void {
  const rules = state.ruleset.combat;
  const unitScale = l.cell / rules.cellUnits;
  const pulse = Math.floor(now / 150) % 2 === 0;
  for (const u of units) {
    const color = playerColor(u.owner);
    const f = u.fighter;
    if (f) {
      // Attack reach, wind-up and guard, scaled to the grid.
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(u.cx, u.cy, rules.attackRange * unitScale, 0, Math.PI * 2);
      ctx.stroke();
      if (f.windup > 0) {
        const t = 1 - f.windup / rules.windupTicks;
        ctx.strokeStyle = C.danger;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(u.cx, u.cy, l.cell * 0.45, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
        ctx.stroke();
      }
      if (f.guard > 0) {
        ctx.strokeStyle = C.pp;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const a0 = f.facing > 0 ? 0 : Math.PI;
        ctx.arc(u.cx, u.cy, l.cell * 0.5, a0 - 1, a0 + 1);
        ctx.stroke();
      }
    }
    const flash = f && ui.flash[f.side] > 0 && Math.floor(now / 60) % 2 === 0 ? '#ffffff' : undefined;
    drawCreature(ctx, u.defId, u.owner, u.cx, u.cy - 3, u.px, { flip: f ? f.facing < 0 : u.owner === 'P2' && !!state.battle, flash });
    const left = u.cx - l.cell / 2;
    const top = u.cy - l.cell / 2;
    badge(ctx, left + 8, top + 8, 9, u.owner, color);
    hpBar(ctx, { x: left + 5, y: top + l.cell - 9, w: l.cell - 10, h: 5 }, u.hp, u.maxHp, color);
    if (u.creatureId === ui.selected) {
      strokeRect(ctx, { x: left + 1, y: top + 1, w: l.cell - 2, h: l.cell - 2 }, pulse ? C.text : color, 2);
    }
  }
  if (isCombatView(state)) {
    for (const fl of ui.floaters) {
      const p = combatToScreen(state, l, fl.x, fl.y);
      text(ctx, fl.text, p.x, p.y - (800 - fl.ms) / 25, { size: 16, color: fl.color, align: 'center' });
    }
  }
}
