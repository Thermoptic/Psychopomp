// Combat arena presentation, used from the moment both players are READY
// (countdown, combat, result): a wide grid arena below a top HUD. Same grid
// look and creature scale as the strategic board; only layout differs.

import type { MatchUi } from '../app/ui';
import { arenaGrid, computeBlockCharges, type GameState, type PlayerId } from '../core';
import { boardUnits, combatToScreen } from './boardUnits';
import { drawUnits } from './boardView';
import { hpBar, measure, panel, rect, text, type Ctx } from './draw';
import { ARENA_AREA, BOARD_AREA, COMBAT_HUD, arenaLayout, type BoardLayout, type Rect } from './layout';
import { C, playerColor } from './theme';

/** Length of the board -> arena expand transition. */
export const ARENA_EXPAND_MS = 450;

export function currentArenaLayout(state: GameState): BoardLayout {
  const g = arenaGrid(state.ruleset.combat);
  return arenaLayout(g.width, g.height);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The arena grid with the two combatants. `expandMs` > 0 animates the arena
 * opening outward from the strategic board's footprint.
 */
export function drawArena(ctx: Ctx, state: GameState, ui: MatchUi, now: number, expandMs: number): void {
  const g = arenaGrid(state.ruleset.combat);
  const l = currentArenaLayout(state);
  const frame: Rect = ARENA_AREA;

  // Expand: interpolate the visible frame from the board area to the arena.
  const t = expandMs > 0 ? 1 - Math.pow(expandMs / ARENA_EXPAND_MS, 2) : 1;
  const from: Rect = { x: BOARD_AREA.x, y: frame.y, w: BOARD_AREA.w, h: frame.h };
  const vis: Rect = {
    x: Math.round(lerp(from.x, frame.x, t)),
    y: frame.y,
    w: Math.round(lerp(from.w, frame.w, t)),
    h: frame.h,
  };

  panel(ctx, vis);
  ctx.save();
  ctx.beginPath();
  ctx.rect(vis.x + 6, vis.y + 6, vis.w - 12, vis.h - 12);
  ctx.clip();
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const r = { x: l.ox + x * l.cell, y: l.oy + y * l.cell, w: l.cell, h: l.cell };
      rect(ctx, r, (x + y) % 2 === 0 ? C.cellA : C.cellB);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    }
  }
  // Faint centre line so the wide arena still reads as one field.
  ctx.fillStyle = 'rgba(57,224,200,0.08)';
  ctx.fillRect(l.ox + Math.floor((g.width * l.cell) / 2) - 1, l.oy, 2, g.height * l.cell);
  drawUnits(ctx, state, ui, l, boardUnits(state, l), now);
  drawProjectiles(ctx, state, ui, l);
  ctx.restore();
}

/** Projectiles (from game state) and impact shockwaves (from events). */
function drawProjectiles(ctx: Ctx, state: GameState, ui: MatchUi, l: BoardLayout): void {
  const combat = state.battle?.combat;
  if (!combat) return;
  const scale = l.cell / state.ruleset.combat.cellUnits;
  for (const p of combat.projectiles) {
    const owner = state.creatures[p.side === 'attacker' ? state.battle!.attackerId : state.battle!.defenderId].owner;
    const s = combatToScreen(state, l, p.x / 256, p.y / 256);
    const tail = combatToScreen(state, l, (p.x - p.vx * 2) / 256, (p.y - p.vy * 2) / 256);
    ctx.strokeStyle = playerColor(owner);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    rect(ctx, { x: Math.round(s.x) - 3, y: Math.round(s.y) - 3, w: 6, h: 6 }, '#fff6d8');
  }
  for (const im of ui.impacts) {
    const s = combatToScreen(state, l, im.x, im.y);
    const t = 1 - im.ms / 350;
    ctx.strokeStyle = im.color;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(2, im.radius * scale * (0.4 + 0.6 * t)), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

interface HudData {
  name: string;
  hp: number;
  maxHp: number;
  power: number;
  shield: number;
  speed: number;
  guard: number;
  attack: 'READY' | 'SWING' | 'RELOAD' | 'WAIT';
  /** Dash: 'READY', 'DASH' while dashing, or remaining cooldown seconds. */
  dash: string;
  special: { name: string; active: boolean; manualReady: boolean } | null;
}

/** HUD numbers for one player: live fighter during combat, the build during the countdown. */
function hudData(state: GameState, owner: PlayerId): HudData | null {
  const b = state.battle;
  if (!b || !b.builds) return null;
  const side = state.creatures[b.attackerId].owner === owner ? 'attacker' : 'defender';
  const cr = state.creatures[side === 'attacker' ? b.attackerId : b.defenderId];
  const def = state.creatureDefs[cr.defId];
  const build = b.builds[side];
  const f = b.combat?.fighters[side];
  return {
    name: def.name.toUpperCase(),
    hp: f ? f.hp : cr.hp,
    maxHp: def.stats.maxHp,
    power: build.stats.power,
    shield: build.stats.shield,
    speed: build.stats.speed,
    guard: f ? f.blockCharges : computeBlockCharges(build.stats, state.ruleset.combat),
    attack: !f ? 'WAIT' : f.windup > 0 ? 'SWING' : f.cooldown > 0 ? 'RELOAD' : 'READY',
    dash: !f ? 'WAIT' : f.dashTicks > 0 ? 'DASH' : f.dashCooldown > 0 ? (f.dashCooldown / state.ruleset.combat.tickRate).toFixed(1) + 's' : 'READY',
    special: build.specialName
      ? {
          name: build.specialName.toUpperCase(),
          // Manual Specials count as active once triggered.
          active: f ? f.special === 'passive' || f.special === 'used' : build.specialActive && !build.specialManual,
          manualReady: f ? f.special === 'ready' : build.specialActive && build.specialManual,
        }
      : null,
  };
}

/** Top HUD: P1 on the left, P2 mirrored on the right, timer in the middle. */
export function drawCombatHud(ctx: Ctx, state: GameState): void {
  const H = COMBAT_HUD;
  panel(ctx, H, undefined, '#101015');
  const mid = H.x + H.w / 2;
  for (const owner of ['P1', 'P2'] as const) {
    const d = hudData(state, owner);
    if (!d) continue;
    const color = playerColor(owner);
    const mirror = owner === 'P2';
    // x positions measured from the HUD's outer edge on this player's side.
    const X = (off: number) => (mirror ? H.x + H.w - off : H.x + off);
    const al = mirror ? 'right' : 'left';
    const ar = mirror ? 'left' : 'right';
    const top = H.y + 20;
    const bot = H.y + 40;

    // Name + HP block.
    ctx.fillStyle = color;
    ctx.fillRect(mirror ? H.x + H.w - 6 : H.x + 3, H.y + 6, 3, H.h - 12);
    text(ctx, d.name, X(14), top, { size: 14, color: C.text, align: al });
    if (d.special && (d.special.active || d.special.manualReady)) {
      const w = measure(ctx, d.name, 14) + 8;
      const label = d.special.manualReady ? `${d.special.name} [LT]` : d.special.name;
      text(ctx, label, mirror ? X(14) - w : X(14) + w, top, { size: 9, color: d.special.manualReady ? C.pp : C.ok, align: al });
    }
    text(ctx, `${d.hp}/${d.maxHp}`, X(206), top, { size: 14, color: d.hp <= d.maxHp / 4 ? C.danger : C.text, align: ar });
    hpBar(ctx, { x: mirror ? H.x + H.w - 206 : H.x + 14, y: bot - 8, w: 192, h: 10 }, d.hp, d.maxHp, color);

    // Stat columns, separated by thin rules. Each column always reads
    // "LABEL ... value" left to right; only the column order is mirrored.
    const col = (off: number, label1: string, v1: string, label2: string, v2: string | null, pips = 0) => {
      const left = Math.min(X(off), X(off + 78));
      const right = Math.max(X(off), X(off + 78));
      ctx.fillStyle = C.faint;
      ctx.fillRect(mirror ? right + 6 : left - 6, H.y + 8, 1, H.h - 16);
      text(ctx, label1, left, top, { size: 10, color: C.dim });
      text(ctx, v1, right, top, { size: 13, color: C.text, align: 'right' });
      text(ctx, label2, left, bot, { size: 10, color: C.dim });
      if (v2 !== null) text(ctx, v2, right, bot, { size: 13, color: C.text, align: 'right' });
      for (let k = 0; k < pips; k++) rect(ctx, { x: right - 9 - k * 11, y: bot - 9, w: 9, h: 9 }, C.pp);
    };
    col(220, 'POWER', String(d.power), 'SHIELD', String(d.shield));
    col(310, 'SPEED', String(d.speed), 'GUARD', d.guard === 0 ? '-' : null, d.guard);

    // Attack + dash status.
    ctx.fillStyle = C.faint;
    ctx.fillRect(X(394), H.y + 8, 1, H.h - 16);
    const atkColor = d.attack === 'READY' ? C.ok : d.attack === 'SWING' ? C.danger : C.dim;
    text(ctx, 'ATK', X(400), top, { size: 9, color: C.dim, align: al });
    text(ctx, d.attack, X(422), top, { size: 10, color: atkColor, align: al });
    const dashColor = d.dash === 'READY' ? C.ok : d.dash === 'DASH' ? C.pp : C.dim;
    text(ctx, 'DSH', X(400), bot, { size: 9, color: C.dim, align: al });
    text(ctx, d.dash, X(422), bot, { size: 10, color: dashColor, align: al });
  }

  // Centre: time left / status.
  const b = state.battle;
  const rules = state.ruleset.combat;
  let centre = '';
  if (b?.stage === 'countdown') centre = 'READY';
  else if (b?.combat && rules.timeoutTicks > 0) centre = String(Math.max(0, Math.ceil((rules.timeoutTicks - b.combat.tick) / rules.tickRate)));
  text(ctx, 'TIME', mid, H.y + 18, { size: 9, color: C.dim, align: 'center' });
  text(ctx, centre, mid, H.y + 38, { size: 16, color: centre === 'READY' ? C.ok : C.text, align: 'center' });
}

/** Big 3-2-1 over the arena while the countdown runs, then BATTLE!. */
export function drawCountdown(ctx: Ctx, state: GameState, ui: MatchUi): void {
  const b = state.battle;
  const g = arenaGrid(state.ruleset.combat);
  const l = currentArenaLayout(state);
  const cx = l.ox + (l.cell * g.width) / 2;
  const cy = l.oy + (l.cell * g.height) / 2;
  let label = '';
  if (b?.stage === 'countdown') label = String(Math.max(1, Math.ceil(b.countdown / state.ruleset.combat.tickRate)));
  else if (ui.bannerMs > 0) label = 'BATTLE!';
  if (!label) return;
  const size = label.length > 1 ? 44 : 96;
  text(ctx, label, cx + 3, cy + 3, { size, color: C.edgeDark, align: 'center', baseline: 'middle' });
  text(ctx, label, cx, cy, { size, color: label.length > 1 ? C.danger : C.text, align: 'center', baseline: 'middle' });
}

