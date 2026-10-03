// Board screen: header, player panels, the tactical grid and the message bar.
// Legal moves are *queried* from the core; nothing here decides legality.

import type { MatchUi } from '../app/ui';
import { baseBattleStats, creatureAt, getLegalMoves, livingCreatures, resolveWeapon, type GameState, type PlayerId } from '../core';
import { badge, emblem, hpBar, iconTile, measure, panel, playerTag, rect, sectionLed, sectionPlate, segmentBar, strokeRect, text, wrapText, type Ctx } from './draw';
import { drawBoardSurface, drawPowerPointMarker } from './boardArt';
import { BOARD_AREA, HEADER, LEFT_PANEL, MESSAGE_BAR, RIGHT_PANEL, boardLayout, cellRect, type BoardLayout, type Rect } from './layout';
import { aimReticle, boardUnits, combatToScreen, isBattleView, isCombatView, type BoardUnit } from './boardUnits';
import { defaultFacing } from './art';
import { drawCreature } from './sprites';
import { SLASH_MS, coneHalfAngle, drawSwish } from './swordSwing';
import { C, CATEGORY_COLOR, STAT_TILE, playerColor, playerLabel } from './theme';

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

  // Power Points held: P1 on the left, P2 on the right, in their colours.
  const count = (o: PlayerId) => state.powerPoints.filter((pp) => pp.owner === o).length;
  const total = state.powerPoints.length;
  text(ctx, `${count('P1')}/${total}`, H.x + 16, cy + 8, { size: 20, color: C.p1 });
  text(ctx, `${count('P2')}/${total}`, H.x + H.w - 16, cy + 8, { size: 20, color: C.p2, align: 'right' });
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

/** The stat rows of the player panel (all five dice categories). */
const PANEL_STATS = [
  { key: 'power', label: 'POWER' },
  { key: 'speed', label: 'SPEED' },
  { key: 'shield', label: 'SHIELD' },
  { key: 'dash', label: 'DASH' },
  { key: 'block', label: 'BLOCK' },
] as const;

/**
 * A player's panel beside the board, in three sections like the reference:
 * the creature (avatar, name, HP, attack type), its stats (all five, each
 * with an icon tile and a gauge) and its Special. P2 is mirrored where it
 * reads naturally (avatar on the outer side).
 */
export function drawPlayerPanel(ctx: Ctx, state: GameState, ui: MatchUi, player: PlayerId, r: Rect): void {
  const color = playerColor(player);
  const mirror = player === 'P2';
  panel(ctx, r, color);
  const x = r.x + 8;
  const w = r.w - 16;

  // Header: P1/P2 tag (outer corner) and player name.
  sectionPlate(ctx, { x, y: r.y + 7, w, h: 32 });
  const tagX = mirror ? r.x + r.w - 14 - 40 : r.x + 14;
  playerTag(ctx, tagX, r.y + 12, player);
  text(ctx, playerLabel(player), mirror ? tagX - 8 : tagX + 48, r.y + 29, { size: 14, color, align: mirror ? 'right' : 'left' });

  const id = panelCreature(state, ui, player);
  if (!id) return;
  const cr = state.creatures[id];
  const def = state.creatureDefs[cr.defId];

  // 1. The creature.
  const mon: Rect = { x, y: r.y + 45, w, h: 90 };
  sectionPlate(ctx, mon);
  emblem(ctx, mirror ? mon.x + 34 : mon.x + mon.w - 34, mon.y + mon.h / 2, 3);
  const portX = mirror ? mon.x + mon.w - 8 - 74 : mon.x + 8;
  rect(ctx, { x: portX - 1, y: mon.y + 7, w: 76, h: 76 }, C.edgeDark);
  drawCreature(ctx, def.id, player, portX + 37, mon.y + 45, 6.2, { portrait: def.art?.portrait, face: defaultFacing(player) });
  const nx = mirror ? portX - 9 : portX + 84;
  const align = mirror ? 'right' : 'left';
  text(ctx, def.name.toUpperCase(), nx, mon.y + 24, { size: 15, color: C.text, align });
  text(ctx, `${cr.hp}/${def.stats.maxHp} HP`, nx, mon.y + 46, { size: 13, color: cr.hp < def.stats.maxHp ? C.danger : color, align });
  const barW = mon.w - 100;
  hpBar(ctx, { x: mirror ? nx - barW : nx, y: mon.y + 53, w: barW, h: 9 }, cr.hp, def.stats.maxHp, color);
  // Attack type of the weapon it fights with (an equipped Powerup replaces its own attack).
  const weapon = resolveWeapon(def, state.powerupDefs, state.ruleset.combat);
  text(ctx, weapon.kind === 'ranged' ? 'RANGE' : 'MELEE', nx, mon.y + 80, { size: 14, color: C.text, align });
  // Level (grows when it wins a battle by killing its opponent), on the inner end of the row.
  text(ctx, `LV.${cr.level}`, mirror ? mon.x + 10 : mon.x + mon.w - 10, mon.y + 80, { size: 14, color, align: mirror ? 'left' : 'right' });
  sectionLed(ctx, r.x + r.w / 2, mon.y + mon.h + 3, color);

  // 2. Stats: icon tile, label, value, gauge (0-10).
  const stats: Rect = { x, y: mon.y + mon.h + 7, w, h: 142 };
  sectionPlate(ctx, stats);
  const base = baseBattleStats(def, state.ruleset, cr.bonus);
  PANEL_STATS.forEach((st, i) => {
    const ry = stats.y + 7 + i * 26;
    rect(ctx, { x: stats.x + 5, y: ry - 1, w: stats.w - 10, h: 25 }, i % 2 ? '#0d0b09' : '#13110e');
    iconTile(ctx, stats.x + 8, ry + 1, 21, STAT_TILE[st.key], st.key);
    text(ctx, st.label, stats.x + 36, ry + 17, { size: 13, color: CATEGORY_COLOR[st.key] });
    const v = base[st.key];
    text(ctx, String(v), stats.x + 120, ry + 17, { size: 14, color: C.text, align: 'right' });
    segmentBar(ctx, { x: stats.x + 128, y: ry + 7, w: stats.w - 136, h: 9 }, v, 10, STAT_TILE[st.key]);
  });
  sectionLed(ctx, r.x + r.w / 2, stats.y + stats.h + 3, color);

  // 3. Special.
  const sp: Rect = { x, y: stats.y + stats.h + 7, w, h: r.y + r.h - 8 - (stats.y + stats.h + 7) };
  sectionPlate(ctx, sp);
  emblem(ctx, sp.x + sp.w - 40, sp.y + sp.h / 2 + 10, 3, 0.06);
  iconTile(ctx, sp.x + 8, sp.y + 8, 21, STAT_TILE.dash, 'special');
  if (def.special) {
    text(ctx, def.special.name.toUpperCase(), sp.x + 36, sp.y + 24, { size: 13, color: C.ok });
    ctx.fillStyle = 'rgba(184,234,121,0.18)';
    ctx.fillRect(sp.x + 8, sp.y + 34, sp.w - 16, 1);
    if (def.special.description) wrapText(ctx, def.special.description, sp.x + 10, sp.y + 52, sp.w - 20, { size: 11, color: C.text });
  } else {
    text(ctx, 'NO SPECIAL', sp.x + 36, sp.y + 24, { size: 13, color: C.faint });
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
  const mid = B.x + B.w / 2;
  if (measure(ctx, msg, 14) <= maxW) {
    text(ctx, msg, mid, B.y + B.h / 2 + 5, { size: 14, color, align: 'center' });
    return;
  }
  // Two centred lines at body size.
  const lines: string[] = [];
  let line = '';
  for (const word of msg.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(ctx, next, 11) > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((l, i) => text(ctx, l, mid, B.y + 15 + i * 12, { size: 11, color, align: 'center' }));
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
          face: f.facing < 0 ? 'left' : 'right',
          flash: color,
          portrait,
          portraitSize,
        });
      }
      ctx.restore();
    }
    const flash = f && ui.flash[f.side] > 0 && Math.floor(now / 60) % 2 === 0 ? '#ffffff' : undefined;
    drawCreature(ctx, u.defId, u.owner, u.cx, u.cy - (portrait ? 0 : 3), u.px, { face: f ? (f.facing < 0 ? 'left' : 'right') : defaultFacing(u.owner), flash, portrait, portraitSize });
    if (f && f.weapon.kind === 'melee') {
      // Swish across the aim cone, shown on the button press.
      const reach = f.weapon.range * unitScale;
      const half = coneHalfAngle(rules.attackConeCos);
      for (const sl of ui.slashes) {
        if (sl.side === f.side) drawSwish(ctx, u.cx, u.cy, sl.aim, half, reach, 1 - sl.ms / SLASH_MS, color);
      }
    }
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
