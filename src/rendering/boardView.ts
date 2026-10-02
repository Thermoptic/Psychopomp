// Board screen: header, player panels, the tactical grid and the message bar.
// Legal moves are *queried* from the core; nothing here decides legality.

import type { MatchUi } from '../app/ui';
import { baseBattleStats, creatureAt, describeRequirement, getLegalMoves, livingCreatures, type GameState, type PlayerId } from '../core';
import { badge, categoryIcon, hpBar, measure, panel, playerTag, rect, strokeRect, text, wrapText, type Ctx } from './draw';
import { drawBoardSurface, drawPowerPointMarker } from './boardArt';
import { BOARD_AREA, HEADER, LEFT_PANEL, MESSAGE_BAR, RIGHT_PANEL, boardLayout, cellRect, type BoardLayout, type Rect } from './layout';
import { aimReticle, boardUnits, combatToScreen, isBattleView, isCombatView, type BoardUnit } from './boardUnits';
import { movementText } from './movementText';
import { drawCreature } from './sprites';
import { C, CATEGORY_COLOR, playerColor, playerLabel } from './theme';

/** A hanging pennant in a player's colour (the reference's banners beside the title). */
function pennant(ctx: Ctx, x: number, y: number, h: number, color: string, dark: string): void {
  const w = 22;
  ctx.fillStyle = '#050404';
  ctx.fillRect(x - 1, y, w + 2, h + 1);
  ctx.fillStyle = dark;
  ctx.fillRect(x, y, w, h - 6);
  ctx.beginPath();
  ctx.moveTo(x, y + h - 6);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x + w, y + h - 6);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(x + 3, y, w - 6, 2);
  // Cross emblem.
  ctx.fillRect(x + w / 2 - 1, y + 7, 2, 14);
  ctx.fillRect(x + w / 2 - 6, y + 12, 12, 2);
}

/**
 * Title plaque above the board: PSYCHOPOMP in the middle, the turn on the
 * left, Power Points held on the right; the P1/P2 pennants hang beside it.
 */
export function drawHeader(ctx: Ctx, state: GameState): void {
  const H = HEADER;
  pennant(ctx, H.x - 34, H.y - 6, H.h + 12, C.p1, C.p1dark);
  pennant(ctx, H.x + H.w + 12, H.y - 6, H.h + 12, C.p2, C.p2dark);
  panel(ctx, H, undefined, '#0d0b09');
  const cy = H.y + H.h / 2;
  const mid = H.x + H.w / 2;
  text(ctx, 'PSYCHOPOMP', mid + 2, cy + 10, { size: 22, color: '#2a0c06', align: 'center' });
  text(ctx, 'PSYCHOPOMP', mid, cy + 8, { size: 22, color: C.text, align: 'center' });

  // Turn (left).
  const p = state.currentTurn.player;
  const left = H.x + 14;
  badge(ctx, left + 6, cy - 5, 11, p, playerColor(p));
  if (state.phase === 'gameOver') text(ctx, 'OVER', left + 16, cy - 1, { size: 13, color: playerColor(p) });
  else text(ctx, `TURN ${state.currentTurn.number}`, left + 16, cy - 1, { size: 13, color: playerColor(p) });
  text(ctx, playerLabel(p), left, cy + 13, { size: 9, color: C.dim });

  // Power Points held (right).
  const count = (o: PlayerId) => state.powerPoints.filter((pp) => pp.owner === o).length;
  const total = state.powerPoints.length;
  const R = H.x + H.w - 14;
  text(ctx, 'POWER POINTS', R, cy - 5, { size: 9, color: C.dim, align: 'right' });
  badge(ctx, R - 82, cy + 7, 10, 'P1', C.p1);
  text(ctx, `${count('P1')}/${total}`, R - 74, cy + 12, { size: 13, color: C.p1 });
  badge(ctx, R - 34, cy + 7, 10, 'P2', C.p2);
  text(ctx, `${count('P2')}/${total}`, R - 26, cy + 12, { size: 13, color: C.p2 });
}

/** One stat row: category icon + coloured label + value. */
function statLine(ctx: Ctx, x: number, y: number, label: string, value: string, category?: string): void {
  const col = (category && CATEGORY_COLOR[category]) || C.dim;
  if (category) categoryIcon(ctx, category, x, y - 11, col, 2);
  text(ctx, label, x + 20, y, { size: 13, color: col });
  text(ctx, value, x + 118, y, { size: 14, color: C.text });
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
  const mirror = player === 'P2';
  const active = state.currentTurn.player === player && state.phase === 'board';
  panel(ctx, r, color);
  // Header: P1/P2 tag (outer corner), player name, turn marker.
  const tagX = mirror ? r.x + r.w - 12 - 40 : r.x + 12;
  playerTag(ctx, tagX, r.y + 10, player);
  text(ctx, playerLabel(player), mirror ? tagX - 8 : tagX + 48, r.y + 27, { size: 14, color, align: mirror ? 'right' : 'left' });
  if (active) text(ctx, 'TO MOVE', mirror ? r.x + 14 : r.x + r.w - 14, r.y + 26, { size: 11, color: C.pp, align: mirror ? 'left' : 'right' });

  const id = panelCreature(state, ui, player);
  let y = r.y + 42;
  if (id) {
    const cr = state.creatures[id];
    const def = state.creatureDefs[cr.defId];
    // Portrait on the outer side, name + HP beside it (mirrored for P2).
    const portX = mirror ? r.x + r.w - 12 - 84 : r.x + 12;
    rect(ctx, { x: portX, y, w: 84, h: 84 }, '#0c0a08');
    drawCreature(ctx, def.id, player, portX + 42, y + 42, 7, { portrait: def.art?.portrait });
    const nx = mirror ? portX - 10 : portX + 94;
    const align = mirror ? 'right' : 'left';
    text(ctx, def.name.toUpperCase(), nx, y + 18, { size: 16, color: C.text, align });
    text(ctx, `${cr.hp}/${def.stats.maxHp} HP`, nx, y + 42, { size: 14, color: cr.hp < def.stats.maxHp ? C.danger : color, align });
    const barW = r.w - 120;
    hpBar(ctx, { x: mirror ? nx - barW : nx, y: y + 50, w: barW, h: 10 }, cr.hp, def.stats.maxHp, color);
    text(ctx, cr === state.creatures[ui.selected ?? ''] ? 'SELECTED' : '', nx, y + 76, { size: 11, color: C.pp, align });
    y += 110;
    statLine(ctx, r.x + 14, y, 'MOVEMENT', movementText(def));
    const base = baseBattleStats(def, state.ruleset);
    statLine(ctx, r.x + 14, (y += 21), 'POWER', String(base.power), 'power');
    statLine(ctx, r.x + 14, (y += 21), 'SPEED', String(base.speed), 'speed');
    statLine(ctx, r.x + 14, (y += 21), 'SHIELD', String(base.shield), 'shield');
    y += 26;
    if (def.special) {
      text(ctx, 'SPECIAL', r.x + 14, y, { size: 11, color: C.dim });
      text(ctx, def.special.name.toUpperCase(), r.x + 76, y, { size: 13, color: C.ok });
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
  drawBoardSurface(ctx, BOARD_AREA, l, board.width, board.height, 'board');
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

  // Power Points: lit symbol + owner badge (not colour alone).
  for (const pp of state.powerPoints) drawPowerPointMarker(ctx, cellRect(l, pp), pp.owner ?? null);

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
  const B = MESSAGE_BAR;
  panel(ctx, B, undefined, '#0e0c0a');
  const maxW = B.w - 30;
  if (measure(ctx, msg, 14) <= maxW) {
    text(ctx, msg, B.x + 15, B.y + B.h / 2 + 5, { size: 14, color });
    return;
  }
  // Two lines at body size.
  wrapText(ctx, msg, B.x + 15, B.y + 15, maxW, { size: 11, color, lineH: 12 });
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
    const portrait = state.creatureDefs[u.defId]?.art?.portrait;
    // Board tokens fill their tile, as in the reference.
    const portraitSize = l.cell - 4;
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
    if (f && f.dashTicks > 0) {
      // Dash: motion streak of fading ghosts along the path travelled so far.
      const len = Math.hypot(f.dashDir.x, f.dashDir.y) || 1;
      const travelled = (rules.dash.durationTicks - f.dashTicks) * f.dashStep * unitScale;
      ctx.save();
      for (let k = 3; k >= 1; k--) {
        const back = (travelled * k) / 4;
        ctx.globalAlpha = 0.12 * (4 - k);
        drawCreature(ctx, u.defId, u.owner, u.cx - (f.dashDir.x / len) * back, u.cy - (portrait ? 0 : 3) - (f.dashDir.y / len) * back, u.px, {
          flip: f.facing < 0,
          flash: color,
          portrait,
          portraitSize,
        });
      }
      ctx.restore();
    }
    const flash = f && ui.flash[f.side] > 0 && Math.floor(now / 60) % 2 === 0 ? '#ffffff' : undefined;
    drawCreature(ctx, u.defId, u.owner, u.cx, u.cy - (portrait ? 0 : 3), u.px, { flip: f ? f.facing < 0 : u.owner === 'P2' && !!state.battle, flash, portrait, portraitSize });
    if (f) {
      // Aim reticle: small dot in the player's colour, brighter while the right stick is held.
      const p = aimReticle(u, f, l);
      const active = ui.aimActive[f.side];
      ctx.fillStyle = C.edgeDark;
      ctx.fillRect(Math.round(p.x) - 4, Math.round(p.y) - 4, 8, 8);
      ctx.fillStyle = color;
      ctx.globalAlpha = active ? 1 : 0.6;
      ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6);
      ctx.globalAlpha = 1;
    }
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
