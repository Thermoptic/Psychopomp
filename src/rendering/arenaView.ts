// Combat presentation, used from the moment both players are READY
// (countdown, combat, result): a wide arena that opens out of the board, below
// a top HUD of the same width. Same stone, frame and creature scale as the
// strategic board.

import type { MatchUi } from '../app/ui';
import { arenaGrid, computeBlockCharges, type GameState, type PlayerId } from '../core';
import { boardUnits, combatToScreen } from './boardUnits';
import { drawBoardSurface, drawPowerPointMarker } from './boardArt';
import { drawUnits } from './boardView';
import { categoryIcon, measure, panel, rect, sectionPlate, segmentBar, text, type Ctx } from './draw';
import { ARENA_AREA, BOARD_AREA, COMBAT_HUD, arenaLayout, cellRect, type BoardLayout, type Rect } from './layout';
import { C, CATEGORY_COLOR, playerColor } from './theme';
import { drawCreature } from './sprites';
import { defaultFacing, wallSprite } from './art';

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
  drawWalls(ctx, state, l);
  drawUnits(ctx, state, ui, l, boardUnits(state, l), now);
  drawProjectiles(ctx, state, ui, l);
  ctx.restore();
}

/** This battle's arena walls (shown from the countdown on), drawn over their cells. */
function drawWalls(ctx: Ctx, state: GameState, l: BoardLayout): void {
  for (const w of state.battle?.walls ?? []) {
    const a = cellRect(l, w.cells[0]);
    const b = cellRect(l, w.cells[w.cells.length - 1]);
    const r = { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
    const sp = wallSprite(w.orientation, w.cells.length);
    if (sp) ctx.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, r.x, r.y, r.w, r.h);
    else {
      // Art not loaded: plain stone.
      rect(ctx, r, '#0b0907');
      rect(ctx, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }, '#4a4640');
    }
  }
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
  defId: string;
  portrait: string | undefined;
  name: string;
  hp: number;
  maxHp: number;
  power: number;
  shield: number;
  speed: number;
  /** Guard (block) charges left. */
  guard: number;
  /** Dash: 'ready', 'dashing', 'cooldown' (with 0-1 progress back to ready) or 'none' (no dash). */
  dash: { state: 'ready' | 'dashing' | 'cooldown' | 'none'; progress: number };
  /** A Special or Powerup the player can still trigger (LT), or one that is running. */
  trigger: 'ready' | 'active' | null;
}

/** HUD values for one player: live fighter during combat, the build during the countdown. */
function hudData(state: GameState, owner: PlayerId): HudData | null {
  const b = state.battle;
  if (!b || !b.builds) return null;
  const side = state.creatures[b.attackerId].owner === owner ? 'attacker' : 'defender';
  const cr = state.creatures[side === 'attacker' ? b.attackerId : b.defenderId];
  const def = state.creatureDefs[cr.defId];
  const build = b.builds[side];
  const f = b.combat?.fighters[side];
  const dash: HudData['dash'] = !f
    ? { state: 'ready', progress: 1 }
    : f.dashStep === 0
      ? { state: 'none', progress: 0 }
      : f.dashTicks > 0
        ? { state: 'dashing', progress: 1 }
        : f.dashCooldown > 0
          ? { state: 'cooldown', progress: 1 - f.dashCooldown / Math.max(1, f.dashCooldownTicks) }
          : { state: 'ready', progress: 1 };
  const specialReady = f ? f.special === 'ready' : build.specialActive && build.specialManual;
  const powerupReady = f?.powerup?.limited && f.powerup.state === 'inactive';
  const powerupActive = f?.powerup?.limited && f.powerup.state === 'active';
  return {
    defId: cr.defId,
    portrait: def.art?.portrait,
    name: def.name.toUpperCase(),
    hp: f ? f.hp : cr.hp,
    maxHp: def.stats.maxHp,
    power: build.stats.power,
    shield: build.stats.shield,
    speed: build.stats.speed,
    guard: f ? f.blockCharges : computeBlockCharges(build.stats, state.ruleset.combat),
    dash,
    trigger: specialReady || powerupReady ? 'ready' : powerupActive ? 'active' : null,
  };
}

/** Orange lit glass tube (the reference's warning lights beside the timer). */
function tube(ctx: Ctx, x: number, y: number, h: number): void {
  rect(ctx, { x: x - 1, y: y - 1, w: 7, h: h + 2 }, C.edgeDark);
  ctx.save();
  ctx.globalAlpha = 0.18;
  rect(ctx, { x: x - 4, y: y + 2, w: 13, h: h - 4 }, '#ff6a1a');
  ctx.restore();
  rect(ctx, { x, y, w: 5, h }, '#c2410f');
  rect(ctx, { x: x + 1, y: y + 1, w: 3, h: h - 2 }, '#ff7a2a');
  rect(ctx, { x: x + 2, y: y + 2, w: 1, h: h - 4 }, '#ffd29a');
}

/**
 * Top HUD during a battle (the reference's combat monitor): portrait, name,
 * HP and stats for P1 on the left and P2 mirrored on the right, the time
 * left in the middle. Only the monster names are words; everything else is
 * numbers, bars and icons.
 */
export function drawCombatHud(ctx: Ctx, state: GameState): void {
  const H = COMBAT_HUD;
  panel(ctx, H, undefined, '#0d0b09');
  const mid = H.x + H.w / 2;
  const top = H.y + 4;
  const inner = H.h - 8;
  for (const owner of ['P1', 'P2'] as const) {
    const d = hudData(state, owner);
    if (!d) continue;
    const color = playerColor(owner);
    const mirror = owner === 'P2';
    // A box `off` px in from this player's outer edge (mirrored for P2).
    const R = (off: number, w: number, y = top, h = inner): Rect => ({ x: mirror ? H.x + H.w - off - w : H.x + off, y, w, h });
    const X = (off: number) => (mirror ? H.x + H.w - off : H.x + off);
    const al = mirror ? 'right' : 'left';

    // Portrait in its own plate at the outer edge.
    const pp = R(4, inner);
    sectionPlate(ctx, pp);
    drawCreature(ctx, d.defId, owner, pp.x + pp.w / 2, pp.y + pp.h / 2, 3, { face: defaultFacing(owner), portrait: d.portrait, portraitSize: pp.w - 6 });

    // Name, then (after it) guard charges and an LT-trigger light.
    text(ctx, d.name, X(50), H.y + 19, { size: 15, color: C.text, align: al });
    let ix = X(50) + (mirror ? -1 : 1) * (measure(ctx, d.name, 15) + 8);
    for (let k = 0; k < d.guard; k++) {
      const x = mirror ? ix - 7 : ix;
      rect(ctx, { x, y: H.y + 9, w: 7, h: 7 }, C.edgeDark);
      rect(ctx, { x: x + 1, y: H.y + 10, w: 5, h: 5 }, CATEGORY_COLOR.block);
      ix += mirror ? -9 : 9;
    }
    if (d.trigger) {
      const x = mirror ? ix - 10 : ix + 2;
      categoryIcon(ctx, 'special', x, H.y + 7, d.trigger === 'ready' ? C.pp : C.ok, 1);
    }

    // HP: numbers and a segmented bar.
    const low = d.hp <= d.maxHp / 4;
    text(ctx, `${d.hp}/${d.maxHp}`, X(50), H.y + 37, { size: 12, mono: true, color: low ? C.danger : color, align: al });
    const bar = R(96, 100, H.y + 29, 9);
    // P2's bar is mirrored too: it empties towards the middle.
    ctx.save();
    if (mirror) {
      ctx.translate(bar.x * 2 + bar.w, 0);
      ctx.scale(-1, 1);
    }
    segmentBar(ctx, bar, Math.ceil((d.hp / Math.max(1, d.maxHp)) * 20), 20, low ? C.danger : color);
    ctx.restore();

    // Stats: icon over value, same order on both sides (Power, Speed, Shield, Dash).
    const box = R(206, 168, H.y + 3, H.h - 6);
    sectionPlate(ctx, box);
    const cells: Array<[string, string | null]> = [
      ['power', String(d.power)],
      ['speed', String(d.speed)],
      ['shield', String(d.shield)],
      ['dash', null],
    ];
    cells.forEach(([cat, value], i) => {
      const cx = box.x + 4 + i * 40 + 20;
      if (i > 0) rect(ctx, { x: box.x + 4 + i * 40, y: box.y + 7, w: 1, h: box.h - 14 }, '#2c261f');
      categoryIcon(ctx, cat, cx - 7, box.y + 6, CATEGORY_COLOR[cat], 2);
      if (value !== null) text(ctx, value, cx, box.y + box.h - 7, { size: 12, mono: true, color: C.text, align: 'center' });
      else {
        // Dash: a lit lamp when ready, a filling gauge while cooling down, dark without a dash.
        const g = { x: cx - 10, y: box.y + box.h - 13, w: 20, h: 6 };
        rect(ctx, g, C.edgeDark);
        const fill = d.dash.state === 'none' ? 0 : d.dash.progress;
        const lit = d.dash.state === 'ready' || d.dash.state === 'dashing';
        rect(ctx, { x: g.x + 1, y: g.y + 1, w: Math.round((g.w - 2) * fill), h: g.h - 2 }, lit ? CATEGORY_COLOR.dash : '#4f6b37');
        if (lit) {
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(g.x + 1, g.y + 1, g.w - 2, 1);
        }
      }
    });
  }

  // Centre: time left (the full time while counting down), between two lit tubes.
  const b = state.battle;
  const rules = state.ruleset.combat;
  const plate = { x: Math.round(mid - 32), y: H.y + 2, w: 64, h: H.h - 4 };
  tube(ctx, plate.x - 12, H.y + 7, H.h - 14);
  tube(ctx, plate.x + plate.w + 7, H.y + 7, H.h - 14);
  sectionPlate(ctx, plate);
  if (b && rules.timeoutTicks > 0) {
    const ticks = b.combat ? rules.timeoutTicks - b.combat.tick : rules.timeoutTicks;
    const secs = String(Math.max(0, Math.ceil(ticks / rules.tickRate)));
    const counting = !b.combat;
    text(ctx, secs, mid + 1, H.y + 31, { size: 20, color: '#3a1606', align: 'center' });
    text(ctx, secs, mid, H.y + 30, { size: 20, color: counting ? '#9a5a32' : '#f2a15e', align: 'center' });
  }
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

