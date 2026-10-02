// Battle screens on the strategic board: the two simultaneous preparation
// panels (P1 left, P2 right), the countdown, the combat side panels and the
// result overlay. Every number shown comes from core queries (computeBuild
// etc.); the panels only send commands, the core decides what is legal.

import type { MatchUi, PrepCursor } from '../app/ui';
import { baseBattleStats, computeBuild, computeDashCooldown, slotConditionLabel, type BattleBuild, type BattleSide, type BattleStats, type CombatRules, type GameState, type PlayerId } from '../core';
import { die, hpBar, panel, rect, strokeRect, text, wrapText, type Ctx } from './draw';
import { prepPanelLayout, type Rect } from './layout';
import { prepButton, prepPhaseLabel, shortRequirement } from './prepModel';
import { drawCreature } from './sprites';
import { C, playerColor, playerLabel } from './theme';

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

const CATEGORY_COLOR: Record<string, string> = {
  speed: '#5ab0ff',
  power: '#ff5a4a',
  shield: '#e8d9a8',
  dash: '#39e0c8',
  special: '#6ee06a',
  block: '#4aa8ff',
};

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

  // Header: player tag, phase, creature, persistent HP.
  const tagW = 40;
  const tagX = mirror ? P.x + P.w - 14 - tagW : P.x + 14;
  rect(ctx, { x: tagX, y: P.y + 10, w: tagW, h: 20 }, info.color);
  text(ctx, owner, tagX + tagW / 2, P.y + 21, { size: 15, color: C.edgeDark, align: 'center', baseline: 'middle' });
  const phase = prepPhaseLabel(prep);
  text(ctx, phase, mirror ? P.x + 14 : P.x + P.w - 14, P.y + 25, {
    size: 11,
    color: phase === 'READY' ? C.ok : C.dim,
    align: mirror ? 'left' : 'right',
  });
  const portX = mirror ? P.x + P.w - 14 - 40 : P.x + 14;
  rect(ctx, { x: portX, y: P.y + 36, w: 40, h: 40 }, '#0c0c10');
  strokeRect(ctx, { x: portX, y: P.y + 36, w: 40, h: 40 }, info.color, 1);
  drawCreature(ctx, info.def.id, owner, portX + 20, P.y + 56, 3, { flip: mirror });
  const nameX = mirror ? portX - 8 : portX + 48;
  const align = mirror ? 'right' : 'left';
  text(ctx, info.def.name.toUpperCase(), nameX, P.y + 50, { size: 14, align });
  text(ctx, `${info.cr.hp}/${info.def.stats.maxHp} HP`, nameX, P.y + 68, {
    size: 12,
    align,
    color: info.cr.hp < info.def.stats.maxHp ? C.danger : C.text,
  });
  const barW = 64;
  hpBar(ctx, { x: mirror ? nameX - 84 - barW : nameX + 84, y: P.y + 60, w: barW, h: 8 }, info.cr.hp, info.def.stats.maxHp, info.color);

  const build = computeBuild(info.def, prep, state.ruleset);
  const base = baseBattleStats(info.def, state.ruleset);
  const slotReq = info.def.special?.requirement.type === 'slots' ? info.def.special.requirement.slots : null;
  const focusOn = (kind: 'die' | 'slot', i: number) => editable && cur.row === i && cur.col === kind;

  L.rows.forEach((row, i) => {
    // LOCK tag (only meaningful while rolling).
    if (prep.stage === 'roll') {
      const on = prep.locked[i];
      rect(ctx, row.lock, on ? info.color : C.panel2);
      strokeRect(ctx, row.lock, on ? info.color : C.faint, 1);
      text(ctx, 'LOCK', row.lock.x + row.lock.w / 2, row.lock.y + 8, {
        size: 8,
        color: on ? C.edgeDark : C.dim,
        align: 'center',
        baseline: 'middle',
      });
    }
    // Die tray: the die, or an empty socket once it has been placed.
    const placed = prep.slotDice.includes(i);
    if (placed) strokeRect(ctx, row.die, C.faint, 1);
    else die(ctx, row.die, prep.dice[i], { locked: prep.stage === 'roll' && prep.locked[i], held: cur.held === i, accent: info.color });
    if (focusOn('die', i)) strokeRect(ctx, { x: row.die.x - 3, y: row.die.y - 3, w: row.die.w + 6, h: row.die.h + 6 }, C.text, 2);

    // Slot i and its category.
    const slot = prep.slots[i];
    if (!slot) return;
    rect(ctx, row.slot, '#0d0d12');
    strokeRect(ctx, row.slot, focusOn('slot', i) ? C.text : C.faint, focusOn('slot', i) ? 2 : 1);
    const d = prep.slotDice[i];
    if (d !== null) die(ctx, { x: row.slot.x + 2, y: row.slot.y + 2, w: row.slot.w - 4, h: row.slot.h - 4 }, prep.dice[d]);
    else if (slotReq ? slotReq[i] !== null && slotReq[i] !== undefined : slot.category === 'special' && info.def.special) {
      // Special trigger condition for this slot (per-slot conditions, or the classic SPECIAL slot).
      const label = slotReq ? slotConditionLabel(slotReq[i]!) : shortRequirement(info.def.special!.requirement);
      text(ctx, label, row.slot.x + row.slot.w / 2, row.slot.y + row.slot.h / 2, {
        size: 10,
        color: C.danger,
        align: 'center',
        baseline: 'middle',
      });
    }
    const cc = CATEGORY_COLOR[slot.category] ?? C.text;
    text(ctx, slot.category.toUpperCase(), row.labelX, row.y + row.h / 2 - 2, { size: 13, color: cc, align: row.labelAlign });
    const preview = slotPreview(base, slot.category, build, state.ruleset.combat);
    if (preview) text(ctx, preview, row.labelX, row.y + row.h / 2 + 12, { size: 10, color: C.dim, align: row.labelAlign });
  });

  // Special: requirement, effect and live status.
  if (info.def.special) {
    const sx = P.x + 14;
    const anyInSpecial = slotReq
      ? slotReq.some((c, i) => c !== null && prep.slotDice[i] !== null)
      : prep.slots.some((s, i) => s.category === 'special' && prep.slotDice[i] !== null);
    text(ctx, `SPECIAL: ${info.def.special.name.toUpperCase()}`, sx, L.specialY, { size: 11, color: C.ok });
    if (anyInSpecial) {
      text(ctx, build.specialActive ? 'ACTIVE' : 'NOT MET', P.x + P.w - 14, L.specialY, {
        size: 11,
        color: build.specialActive ? C.ok : C.danger,
        align: 'right',
      });
    }
    wrapText(ctx, info.def.special.description ?? '', sx, L.specialY + 15, P.w - 28, { size: 11, color: C.text });
  }

  if (locked) {
    // Dim the locked build so READY is obvious at a glance.
    ctx.fillStyle = 'rgba(7,7,10,0.5)';
    ctx.fillRect(P.x + 3, P.y + 80, P.w - 6, L.button.y - P.y - 86);
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
    color = C.danger;
    border = C.danger;
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
