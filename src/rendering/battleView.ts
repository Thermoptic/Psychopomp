// Battle screens on the strategic board: the two simultaneous preparation
// panels (P1 left, P2 right), the countdown, the combat side panels and the
// result overlay. Every number shown comes from core queries (computeBuild
// etc.); the panels only send commands, the core decides what is legal.

import type { MatchUi, PrepCursor } from '../app/ui';
import { baseBattleStats, computeBuild, computeDashCooldown, slotConditionLabel, type BattleBuild, type BattleSide, type BattleStats, type CombatRules, type GameState, type PlayerId } from '../core';
import { categoryIcon, die, emblem, hpBar, panel, playerTag, rect, sectionPlate, segmentBar, strokeRect, text, wrapText, type Ctx } from './draw';
import { prepPanelLayout, type Rect } from './layout';
import { prepButton, prepPhaseLabel, shortRequirement } from './prepModel';
import { defaultFacing } from './art';
import { drawCreature } from './sprites';
import { C, CATEGORY_COLOR, STAT_TILE, playerColor, playerLabel } from './theme';

function sideInfo(state: GameState, side: BattleSide) {
  const b = state.battle!;
  const id = side === 'attacker' ? b.attackerId : b.defenderId;
  const cr = state.creatures[id];
  const def = state.creatureDefs[cr.defId];
  return { cr, def, color: playerColor(cr.owner) };
}

/** The battle side a player controls in the current battle. */
export function sideOf(state: GameState, owner: PlayerId): BattleSide {
  return state.creatures[state.battle!.attackerId].owner === owner ? 'attacker' : 'defender';
}

function slotPreview(base: BattleStats, category: string, build: BattleBuild, rules: CombatRules): string {
  const key = category as keyof BattleStats;
  if (!['power', 'shield', 'speed', 'block', 'dash'].includes(category)) return '';
  const b = base[key];
  const d = build.diceByCategory[category] ?? 0;
  if (key === 'dash') return `${b}+${d} → CD ${computeDashCooldown(b + d, rules)}s`;
  return `${b}+${d} = ${b + d}`;
}

/**
 * One player's preparation panel: REROLL -> APPLY (disabled) -> APPLY (green)
 * -> READY. Both panels are live at the same time.
 */
export function drawPrepPanel(ctx: Ctx, state: GameState, ui: MatchUi, owner: PlayerId): void {
  const b = state.battle!;
  const side = sideOf(state, owner);
  const prep = b.prep[side];
  const info = sideInfo(state, side);
  const L = prepPanelLayout(owner, prep.dice.length);
  const P = L.panel;
  const mirror = owner === 'P2';
  const cur: PrepCursor = ui.prep[owner];
  const locked = prep.stage === 'done';
  const editable = b.stage === 'dice' && !locked;
  panel(ctx, P, info.color);
  const align = mirror ? 'right' : 'left';

  // Header section: player tag (outer side) and the phase (inner side).
  sectionPlate(ctx, { x: P.x + 6, y: P.y + 6, w: P.w - 12, h: 28 });
  const tagW = 40;
  const tagX = mirror ? P.x + P.w - 11 - tagW : P.x + 11;
  playerTag(ctx, tagX, P.y + 10, owner, tagW, 20);
  const phase = prepPhaseLabel(prep);
  text(ctx, phase, mirror ? P.x + 15 : P.x + P.w - 15, P.y + 25, { size: 12, color: phase === 'READY' ? C.ok : C.text, align: mirror ? 'left' : 'right' });

  // Creature section: avatar, name, persistent HP.
  const cs: Rect = { x: P.x + 6, y: P.y + 38, w: P.w - 12, h: 50 };
  sectionPlate(ctx, cs);
  emblem(ctx, mirror ? cs.x + 30 : cs.x + cs.w - 30, cs.y + cs.h / 2, 2);
  const portX = mirror ? cs.x + cs.w - 6 - 40 : cs.x + 6;
  rect(ctx, { x: portX - 1, y: cs.y + 4, w: 42, h: 42 }, C.edgeDark);
  drawCreature(ctx, info.def.id, owner, portX + 20, cs.y + 25, 3.3, { face: defaultFacing(owner), portrait: info.def.art?.portrait });
  const nameX = mirror ? portX - 8 : portX + 48;
  text(ctx, info.def.name.toUpperCase(), nameX, cs.y + 18, { size: 14, align });
  text(ctx, `${info.cr.hp}/${info.def.stats.maxHp} HP`, nameX, cs.y + 34, { size: 12, align, color: info.cr.hp < info.def.stats.maxHp ? C.danger : info.color });
  const barW = cs.w - 64;
  hpBar(ctx, { x: mirror ? nameX - barW : nameX, y: cs.y + 39, w: barW, h: 6 }, info.cr.hp, info.def.stats.maxHp, info.color);

  const build = computeBuild(info.def, prep, state.ruleset);
  const base = baseBattleStats(info.def, state.ruleset);
  const slotReq = info.def.special?.requirement.type === 'slots' ? info.def.special.requirement.slots : null;
  const focusOn = (kind: 'die' | 'slot', i: number) => editable && cur.row === i && cur.col === kind;

  L.rows.forEach((row, i) => {
    const slot = prep.slots[i];
    const cat = slot?.category ?? '';
    // Each row is its own section, with a big faint category icon as a watermark.
    const rr: Rect = { x: P.x + 6, y: row.y + 1, w: P.w - 12, h: row.h - 2 };
    sectionPlate(ctx, rr);
    ctx.save();
    ctx.globalAlpha = 0.09;
    categoryIcon(ctx, cat, mirror ? rr.x + 8 : rr.x + rr.w - 8 - 28, rr.y + (rr.h - 28) / 2, '#d8c7a4', 4);
    ctx.restore();

    // LOCK tab (only while rolling): dark grey, lit red when the die is locked.
    if (prep.stage === 'roll') {
      const on = prep.locked[i];
      const t = row.lock;
      rect(ctx, t, C.edgeDark);
      rect(ctx, { x: t.x + 1, y: t.y + 1, w: t.w - 2, h: t.h - 2 }, on ? '#2a0806' : '#24201b');
      ctx.fillStyle = on ? '#ff3b2a' : '#3a342c';
      ctx.fillRect(t.x + 1, t.y + 1, t.w - 2, 1);
      if (on) strokeRect(ctx, t, '#ff3b2a', 1);
      ctx.save();
      if (on) {
        ctx.shadowColor = '#ff2a1a';
        ctx.shadowBlur = 8;
      }
      text(ctx, 'LOCK', t.x + t.w / 2, t.y + t.h / 2 + 1, { size: 9, color: on ? '#ff4a35' : '#5e564b', align: 'center', baseline: 'middle' });
      ctx.restore();
    }

    // Die tray: the die, or an empty socket once it has been placed.
    const placed = prep.slotDice.includes(i);
    if (placed) strokeRect(ctx, row.die, C.faint, 1);
    else {
      die(ctx, row.die, prep.dice[i], { category: cat, held: cur.held === i, accent: info.color });
      if (prep.stage === 'roll' && prep.locked[i]) strokeRect(ctx, { x: row.die.x - 2, y: row.die.y - 2, w: row.die.w + 4, h: row.die.h + 4 }, '#ff3b2a', 2);
    }
    if (focusOn('die', i)) strokeRect(ctx, { x: row.die.x - 3, y: row.die.y - 3, w: row.die.w + 6, h: row.die.h + 6 }, C.text, 2);

    // Slot i and its category.
    if (!slot) return;
    rect(ctx, row.slot, C.edgeDark);
    rect(ctx, { x: row.slot.x + 1, y: row.slot.y + 1, w: row.slot.w - 2, h: row.slot.h - 2 }, '#0d0b09');
    strokeRect(ctx, row.slot, focusOn('slot', i) ? C.text : C.faint, focusOn('slot', i) ? 2 : 1);
    const d = prep.slotDice[i];
    if (d !== null) die(ctx, { x: row.slot.x + 2, y: row.slot.y + 2, w: row.slot.w - 4, h: row.slot.h - 4 }, prep.dice[d], { category: cat });
    else if (slotReq ? slotReq[i] !== null && slotReq[i] !== undefined : cat === 'special' && info.def.special) {
      // Special trigger condition for this slot (per-slot conditions, or the classic SPECIAL slot).
      const label = slotReq ? slotConditionLabel(slotReq[i]!) : shortRequirement(info.def.special!.requirement);
      text(ctx, label, row.slot.x + row.slot.w / 2, row.slot.y + row.slot.h / 2, { size: 10, color: C.danger, align: 'center', baseline: 'middle' });
    }
    // Icon + label, the value preview and a gauge (0-10).
    const cc = CATEGORY_COLOR[cat] ?? C.text;
    const iconX = row.labelAlign === 'left' ? row.labelX : row.labelX - 14;
    categoryIcon(ctx, cat, iconX, rr.y + 4, cc, 2);
    const lx = row.labelAlign === 'left' ? row.labelX + 19 : row.labelX - 19;
    text(ctx, cat.toUpperCase(), lx, rr.y + 15, { size: 13, color: cc, align: row.labelAlign });
    const preview = slotPreview(base, cat, build, state.ruleset.combat);
    if (preview) text(ctx, preview, row.labelX, rr.y + 27, { size: 10, color: C.dim, align: row.labelAlign });
    const key = cat as keyof BattleStats;
    if (key in base) {
      const gw = P.w - 12 - (row.labelAlign === 'left' ? row.labelX - P.x : P.x + P.w - row.labelX) - 8;
      const v = base[key] + (build.diceByCategory[cat] ?? 0);
      segmentBar(ctx, { x: row.labelAlign === 'left' ? row.labelX : row.labelX - gw, y: rr.y + rr.h - 9, w: gw, h: 5 }, v, 10, STAT_TILE[cat] ?? cc);
    }
  });

  // Special section: name, live status and effect.
  const sp: Rect = { x: P.x + 6, y: L.specialY, w: P.w - 12, h: L.button.y - 6 - L.specialY };
  sectionPlate(ctx, sp);
  emblem(ctx, sp.x + sp.w - 30, sp.y + sp.h / 2, 2, 0.06);
  if (info.def.special) {
    const anyInSpecial = slotReq
      ? slotReq.some((c, i) => c !== null && prep.slotDice[i] !== null)
      : prep.slots.some((s, i) => s.category === 'special' && prep.slotDice[i] !== null);
    categoryIcon(ctx, 'special', sp.x + 8, sp.y + 6, C.ok, 2);
    text(ctx, info.def.special.name.toUpperCase(), sp.x + 27, sp.y + 18, { size: 13, color: C.ok });
    if (anyInSpecial) {
      text(ctx, build.specialActive ? 'ACTIVE' : 'NOT MET', sp.x + sp.w - 8, sp.y + 17, { size: 11, color: build.specialActive ? C.ok : C.danger, align: 'right' });
    }
    wrapText(ctx, info.def.special.description ?? '', sp.x + 8, sp.y + 34, sp.w - 16, { size: 11, color: C.text });
  } else {
    text(ctx, 'NO SPECIAL', sp.x + 8, sp.y + 18, { size: 13, color: C.faint });
  }

  if (locked) {
    // Dim the locked build so READY is obvious at a glance.
    ctx.fillStyle = 'rgba(7,7,10,0.5)';
    ctx.fillRect(P.x + 3, L.rows[0]?.y ?? P.y + 92, P.w - 6, L.button.y - 4 - (L.rows[0]?.y ?? P.y + 92));
    text(ctx, 'BUILD LOCKED', P.x + P.w / 2, L.button.y - 10, { size: 11, color: C.ok, align: 'center' });
  }

  // State button: REROLL -> APPLY (grey) -> APPLY (green) -> READY.
  const btn = prepButton(prep);
  const focused = editable && cur.row >= prep.dice.length;
  drawPrepButton(ctx, L.button, btn.label, btn.kind, btn.enabled, focused);
}

function drawPrepButton(ctx: Ctx, r: Rect, label: string, kind: string, enabled: boolean, focused: boolean): void {
  rect(ctx, r, C.edgeDark);
  let fill: string = C.panel2;
  let color: string = C.faint;
  let border: string = C.faint;
  if (kind === 'ready') {
    fill = C.ok;
    color = C.edgeDark;
    border = C.ok;
  } else if (kind === 'apply' && enabled) {
    fill = '#16301a';
    color = C.ok;
    border = C.ok;
  } else if (kind === 'reroll' && enabled) {
    color = '#fd621b';
    border = '#fd621b';
    fill = '#1d0e08';
  }
  rect(ctx, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, fill);
  strokeRect(ctx, r, focused ? C.text : border, 2);
  text(ctx, (focused ? '> ' : '') + label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 16, color, align: 'center', baseline: 'middle' });
}

export function combatTimeLeft(state: GameState): number | null {
  const rules = state.ruleset.combat;
  const combat = state.battle?.combat;
  if (!combat || rules.timeoutTicks <= 0) return null;
  return Math.max(0, Math.ceil((rules.timeoutTicks - combat.tick) / rules.tickRate));
}

export function combatHint(state: GameState): string {
  const b = state.battle!;
  const a = state.creatures[b.attackerId].owner;
  const t = combatTimeLeft(state);
  return `COMBAT  ·  ${playerLabel(a)} ATTACKS${t !== null ? `  ·  TIME ${t}` : ''}`;
}

export function drawResult(ctx: Ctx, state: GameState): void {
  const b = state.battle!;
  const res = b.result!;
  const att = sideInfo(state, 'attacker');
  const def = sideInfo(state, 'defender');
  const r = { x: 230, y: 170, w: 500, h: 200 };
  panel(ctx, r, C.danger);
  let title = '';
  let line2 = '';
  switch (res.outcome) {
    case 'ATTACKER_WINS':
      title = `${att.def.name.toUpperCase()} WINS`;
      line2 = `${att.def.name} survives with ${res.attackerHp}/${att.def.stats.maxHp} HP`;
      break;
    case 'DEFENDER_WINS':
      title = `${def.def.name.toUpperCase()} WINS`;
      line2 = `${def.def.name} survives with ${res.defenderHp}/${def.def.stats.maxHp} HP`;
      break;
    case 'DRAW':
      title = 'BOTH FALL';
      line2 = 'Both creatures are removed from the board';
      break;
    case 'TIMEOUT':
      title = 'TIME OUT';
      line2 = 'The attacker withdraws. Both keep their current HP.';
      break;
  }
  const color = res.outcome === 'ATTACKER_WINS' ? att.color : res.outcome === 'DEFENDER_WINS' ? def.color : C.text;
  text(ctx, title, r.x + r.w / 2, r.y + 60, { size: 28, color, align: 'center' });
  text(ctx, line2, r.x + r.w / 2, r.y + 100, { size: 14, align: 'center' });
  if (res.outcome === 'ATTACKER_WINS' || res.outcome === 'DEFENDER_WINS' || res.outcome === 'TIMEOUT') {
    text(ctx, 'REMAINING HP CARRIES OVER - NO HEALING', r.x + r.w / 2, r.y + 126, { size: 11, color: C.dim, align: 'center' });
  }
  text(ctx, 'PRESS CONFIRM TO RETURN TO THE BOARD', r.x + r.w / 2, r.y + 170, { size: 14, color: C.pp, align: 'center' });
}
