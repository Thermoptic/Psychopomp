// Combat presentation, used from the moment both players are READY
// (countdown, combat, result): a wide arena that opens out of the board, below
// a top HUD of the same width. Same stone, frame and creature scale as the
// strategic board.

import type { MatchUi } from '../app/ui';
import { arenaGrid, computeBlockCharges, type GameState, type PlayerId } from '../core';
import { boardUnits, combatToScreen } from './boardUnits';
import { drawBoardSurface, drawPowerPointMarker } from './boardArt';
import { drawUnits } from './boardView';
import { hpBar, measure, panel, rect, text, type Ctx } from './draw';
import { ARENA_AREA, BOARD_AREA, COMBAT_HUD, arenaLayout, cellRect, type BoardLayout, type Rect } from './layout';
import { C, playerColor } from './theme';

/** Length of the board -> arena expand transition. */
export const ARENA_EXPAND_MS = 450;

export function currentArenaLayout(state: GameState): BoardLayout {
  const g = arenaGrid(state.ruleset.combat);
  return arenaLayout(g.width, g.height);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The wide arena with the two combatants. `expandMs` > 0 animates the arena
 * opening outward from the strategic board's frame to the full width.
 */
export function drawArena(ctx: Ctx, state: GameState, ui: MatchUi, now: number, expandMs: number): void {
  const g = arenaGrid(state.ruleset.combat);
  const l = currentArenaLayout(state);
  const t = expandMs > 0 ? 1 - Math.pow(expandMs / ARENA_EXPAND_MS, 2) : 1;
  const vis: Rect = {
    x: Math.round(lerp(BOARD_AREA.x, ARENA_AREA.x, t)),
    y: ARENA_AREA.y,
    w: Math.round(lerp(BOARD_AREA.w, ARENA_AREA.w, t)),
    h: ARENA_AREA.h,
  };
  // Same frame and stone as the strategic board: the board opens into the arena.
  drawBoardSurface(ctx, vis, l, g.width, g.height, g.width === state.board.width ? 'board' : 'arena');
  if (g.width === state.board.width && g.height === state.board.height) {
    for (const pp of state.powerPoints) drawPowerPointMarker(ctx, cellRect(l, pp), pp.owner ?? null);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(vis.x + 10, vis.y + 10, vis.w - 20, vis.h - 20);
  ctx.clip();
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
    const w = combat.fighters[p.side].weapon;
    const look = w.kind === 'ranged' ? w.look : { size: 1, trail: 0, color: null };
    const color = look.color ?? playerColor(owner);
    const s = combatToScreen(state, l, p.x / 256, p.y / 256);
    const radius = 2 + look.size * 1.4;
    // Trail: the recent path, fading and thinning towards its end.
    const path = ui.trails[p.id] ?? [];
    if (path.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      for (let i = 1; i < path.length; i++) {
        const k = i / path.length;
        const a0 = combatToScreen(state, l, path[i - 1].x, path[i - 1].y);
        const a1 = combatToScreen(state, l, path[i].x, path[i].y);
        ctx.globalAlpha = 0.75 * k * k;
        ctx.lineWidth = Math.max(1, radius * 1.4 * k);
        ctx.beginPath();
        ctx.moveTo(a0.x, a0.y);
        ctx.lineTo(a1.x, a1.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Projectile: soft glow, coloured body, bright core.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.edgeDark;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(1.5, radius * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
    text(ctx, `${d.hp}/${d.maxHp}`, X(184), top, { size: 14, color: d.hp <= d.maxHp / 4 ? C.danger : C.text, align: ar });
    hpBar(ctx, { x: mirror ? H.x + H.w - 184 : H.x + 14, y: bot - 8, w: 170, h: 10 }, d.hp, d.maxHp, color);

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
    col(196, 'POWER', String(d.power), 'SHIELD', String(d.shield));
    col(282, 'SPEED', String(d.speed), 'GUARD', d.guard === 0 ? '-' : null, d.guard);

    // Attack + dash status.
    ctx.fillStyle = C.faint;
    ctx.fillRect(X(366), H.y + 8, 1, H.h - 16);
    const atkColor = d.attack === 'READY' ? C.ok : d.attack === 'SWING' ? C.danger : C.dim;
    text(ctx, 'ATK', X(372), top, { size: 9, color: C.dim, align: al });
    text(ctx, d.attack, X(394), top, { size: 10, color: atkColor, align: al });
    const dashColor = d.dash === 'READY' ? C.ok : d.dash === 'DASH' ? C.pp : C.dim;
    text(ctx, 'DSH', X(372), bot, { size: 9, color: C.dim, align: al });
    text(ctx, d.dash, X(394), bot, { size: 10, color: dashColor, align: al });
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

