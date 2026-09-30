// Battle screens: dice preparation, reveal, real-time combat and result.
// Every number shown comes from core queries (computeBuild etc.).

import type { MatchUi } from '../app/ui';
import {
  computeBuild,
  describeRequirement,
  type PlayerId,
  rerollsRemaining,
  type BattleBuild,
  type BattleSide,
  type BattleStats,
  type DicePrep,
  type GameState,
} from '../core';
import { badge, button, die, hpBar, panel, rect, strokeRect, text, wrapText, type Ctx } from './draw';
import { DICE_SCREEN, diceScreenRows, type DiceItem, type Rect } from './layout';
import { drawCreature } from './sprites';
import { C, playerColor, playerLabel } from './theme';

const sameItem = (a: DiceItem, b: DiceItem) =>
  a.kind === b.kind && (a.kind === 'btn' ? a.id === (b as typeof a).id : a.i === (b as { i: number }).i);

export function focusedItem(prep: DicePrep, ui: MatchUi): DiceItem | null {
  const rows = diceScreenRows(prep);
  const row = rows[Math.min(ui.focus.row, rows.length - 1)];
  return row ? row[Math.min(ui.focus.col, row.length - 1)].item : null;
}

const BUTTON_LABEL: Record<string, string> = {
  roll: 'ROLL DICE',
  reroll: 'REROLL',
  keep: 'KEEP DICE',
  clear: 'CLEAR ALL',
  confirm: 'CONFIRM BUILD',
};

function sideInfo(state: GameState, side: BattleSide) {
  const b = state.battle!;
  const id = side === 'attacker' ? b.attackerId : b.defenderId;
  const cr = state.creatures[id];
  const def = state.creatureDefs[cr.defId];
  return { cr, def, color: playerColor(cr.owner) };
}

export function drawDiceScreen(ctx: Ctx, state: GameState, ui: MatchUi): void {
  const b = state.battle!;
  const side = b.preparing!;
  const prep = b.prep[side];
  const me = sideInfo(state, side);
  const foe = sideInfo(state, side === 'attacker' ? 'defender' : 'attacker');
  const R = DICE_SCREEN;
  panel(ctx, R, me.color);

  badge(ctx, R.x + 26, R.y + 28, 14, me.cr.owner, me.color);
  text(ctx, `${playerLabel(me.cr.owner)}  ·  PREPARE ${me.def.name.toUpperCase()}`, R.x + 42, R.y + 33, { size: 18, color: me.color });
  text(ctx, `${side === 'attacker' ? 'ATTACKER' : 'DEFENDER'}  ·  HP ${me.cr.hp}/${me.def.stats.maxHp}`, R.x + R.w - 20, R.y + 33, { size: 13, color: C.text, align: 'right' });
  text(ctx, `VS ${foe.def.name.toUpperCase()} (${playerLabel(foe.cr.owner)})  ·  HP ${foe.cr.hp}/${foe.def.stats.maxHp}`, R.x + 42, R.y + 54, { size: 12, color: C.dim });

  if (ui.readyGate) {
    drawCreature(ctx, me.def.id, me.cr.owner, R.x + R.w / 2, R.y + 150, 9);
    text(ctx, `${playerLabel(me.cr.owner)}: YOUR DICE`, R.x + R.w / 2, R.y + 250, { size: 22, color: me.color, align: 'center' });
    text(ctx, side === 'defender' ? 'The other build stays hidden until both are done.' : 'Build your creature for this fight.', R.x + R.w / 2, R.y + 280, { size: 13, color: C.dim, align: 'center' });
    text(ctx, 'PRESS CONFIRM WHEN READY', R.x + R.w / 2, R.y + 330, { size: 16, color: C.pp, align: 'center' });
    return;
  }

  const focus = focusedItem(prep, ui);
  const rows = diceScreenRows(prep);

  // Status line.
  const status =
    prep.stage === 'roll'
      ? prep.rollsUsed === 0
        ? 'ROLL FIVE DICE'
        : `ROLL ${prep.rollsUsed} OF ${prep.maxRolls}  ·  REROLLS LEFT: ${rerollsRemaining(prep)}  ·  LOCKED DICE ARE KEPT`
      : 'PLACE EVERY DIE IN A SLOT';
  text(ctx, status, R.x + R.w / 2, R.y + 78, { size: 13, color: C.text, align: 'center' });

  for (const { item, rect: r } of rows[0]) {
    if (item.kind !== 'die') continue;
    const allocated = prep.slotDice.includes(item.i);
    die(ctx, r, prep.dice[item.i], {
      locked: prep.stage === 'roll' && prep.locked[item.i],
      allocated,
      focused: !!focus && sameItem(focus, item),
      held: ui.heldDie === item.i,
      accent: me.color,
    });
    text(ctx, String(item.i + 1), r.x + r.w / 2, r.y + r.h + 32, { size: 10, color: C.faint, align: 'center' });
  }

  const build = computeBuild(me.def, prep);

  if (prep.stage === 'roll') {
    for (const { item, rect: r } of rows[1]) {
      if (item.kind === 'btn') button(ctx, r, BUTTON_LABEL[item.id], { focused: !!focus && sameItem(focus, item), accent: me.color });
    }
    // Layout preview.
    let y = R.y + 262;
    text(ctx, 'DICE SLOTS', R.x + 40, y, { size: 11, color: C.dim });
    const counts: Record<string, number> = {};
    for (const s of prep.slots) counts[s.category] = (counts[s.category] ?? 0) + 1;
    text(ctx, Object.entries(counts).map(([c, n]) => `${c.toUpperCase()} x${n}`).join('   '), R.x + 40, (y += 18), { size: 13 });
    y += 28;
    drawSpecialLine(ctx, me.def.special, null, R.x + 40, y, R.w - 80);
    text(ctx, 'CONFIRM: lock / unlock die  ·  REROLL key: reroll  ·  CANCEL: keep dice', R.x + R.w / 2, R.y + R.h - 16, { size: 11, color: C.dim, align: 'center' });
    return;
  }

  // Allocation.
  for (const { item, rect: r } of rows[1]) {
    if (item.kind !== 'slot') continue;
    const slot = prep.slots[item.i];
    const focused = !!focus && sameItem(focus, item);
    rect(ctx, r, C.edgeDark);
    rect(ctx, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, focused ? '#26262f' : '#18181f');
    if (focused) strokeRect(ctx, r, me.color, 2);
    text(ctx, slot.category.toUpperCase(), r.x + r.w / 2, r.y + 18, { size: 12, color: slot.category === 'special' ? C.pp : C.text, align: 'center' });
    const d = prep.slotDice[item.i];
    const dieSize = 40;
    const dr = { x: Math.round(r.x + r.w / 2 - dieSize / 2), y: r.y + 28, w: dieSize, h: dieSize };
    if (d === null) {
      strokeRect(ctx, dr, C.faint, 2);
    } else {
      die(ctx, dr, prep.dice[d]);
    }
    text(ctx, slotPreview(me.def.stats, slot.category, build), r.x + r.w / 2, r.y + r.h - 12, { size: 11, color: C.dim, align: 'center' });
  }
  drawSpecialLine(ctx, me.def.special, build, R.x + 40, R.y + 318, R.w - 80);
  for (const { item, rect: r } of rows[2]) {
    if (item.kind === 'btn') {
      const complete = !prep.slotDice.includes(null);
      button(ctx, r, BUTTON_LABEL[item.id], {
        focused: !!focus && sameItem(focus, item),
        disabled: item.id === 'confirm' && !complete,
        accent: me.color,
      });
    }
  }
  text(ctx, 'CONFIRM on a die picks it up, CONFIRM on a slot places it  ·  1-5: pick die', R.x + R.w / 2, R.y + R.h - 8, { size: 11, color: C.dim, align: 'center' });
}

function slotPreview(base: { power: number; shield: number; speed: number; block?: number }, category: string, build: BattleBuild): string {
  const key = category as keyof BattleStats;
  if (!['power', 'shield', 'speed', 'block'].includes(category)) return category === 'special' ? 'TRIGGER' : '';
  const b = key === 'block' ? base.block ?? 0 : base[key];
  return `${b}+${build.diceByCategory[category] ?? 0} = ${b + (build.diceByCategory[category] ?? 0)}`;
}

function drawSpecialLine(
  ctx: Ctx,
  special: GameState['creatureDefs'][string]['special'],
  build: BattleBuild | null,
  x: number,
  y: number,
  w: number,
): void {
  if (!special) {
    text(ctx, 'NO SPECIAL', x, y, { size: 12, color: C.dim });
    return;
  }
  text(ctx, `SPECIAL: ${special.name.toUpperCase()}`, x, y, { size: 13, color: C.pp });
  const req = describeRequirement(special.requirement);
  wrapText(ctx, `NEEDS ${req}  ->  ${special.description ?? ''}`, x, y + 18, w, { size: 12, color: C.text });
  if (build) {
    const on = build.specialActive;
    text(ctx, on ? '[ ACTIVE ]' : '[ NOT MET ]', x + w, y, { size: 13, color: on ? C.ok : C.danger, align: 'right' });
  }
}

// --- Reveal -------------------------------------------------------------------

export function drawReveal(ctx: Ctx, state: GameState): void {
  const b = state.battle!;
  const R = DICE_SCREEN;
  panel(ctx, R, C.danger);
  text(ctx, 'BUILDS REVEALED', R.x + R.w / 2, R.y + 34, { size: 20, color: C.danger, align: 'center' });
  const colW = (R.w - 60) / 2;
  (['attacker', 'defender'] as BattleSide[]).forEach((side, i) => {
    const info = sideInfo(state, side);
    const build = b.builds![side];
    const x = R.x + 20 + i * (colW + 20);
    const y = R.y + 56;
    panel(ctx, { x, y, w: colW, h: 300 }, info.color, C.panel2);
    drawCreature(ctx, info.def.id, info.cr.owner, x + 50, y + 56, 6);
    text(ctx, info.def.name.toUpperCase(), x + 100, y + 36, { size: 17, color: info.color });
    text(ctx, `${playerLabel(info.cr.owner)} · ${side.toUpperCase()}`, x + 100, y + 56, { size: 11, color: C.dim });
    text(ctx, `HP ${info.cr.hp}/${info.def.stats.maxHp}`, x + 100, y + 80, { size: 14 });

    let ty = y + 124;
    const cols = [x + 16, x + 110, x + 160, x + 214, x + 272];
    ['STAT', 'BASE', 'DICE', 'SPEC', 'TOTAL'].forEach((h, k) => text(ctx, h, cols[k], ty, { size: 10, color: C.dim }));
    for (const stat of ['power', 'shield', 'speed', 'block'] as const) {
      ty += 22;
      const base = stat === 'block' ? info.def.stats.block ?? 0 : info.def.stats[stat];
      const dice = build.diceByCategory[stat] ?? 0;
      const spec = build.stats[stat] - base - dice;
      text(ctx, stat.toUpperCase(), cols[0], ty, { size: 13 });
      text(ctx, String(base), cols[1], ty, { size: 13, color: C.dim });
      text(ctx, `+${dice}`, cols[2], ty, { size: 13 });
      text(ctx, spec ? `+${spec}` : '-', cols[3], ty, { size: 13, color: spec ? C.pp : C.faint });
      text(ctx, String(build.stats[stat]), cols[4], ty, { size: 15, color: info.color });
    }
    ty += 34;
    if (build.specialName) {
      text(ctx, `${build.specialName.toUpperCase()}: ${build.specialActive ? 'ACTIVE' : 'NOT MET'}`, x + 16, ty, {
        size: 14,
        color: build.specialActive ? C.ok : C.danger,
      });
    }
  });
  text(ctx, 'PRESS CONFIRM TO FIGHT', R.x + R.w / 2, R.y + R.h - 24, { size: 16, color: C.pp, align: 'center' });
}

// --- Combat -------------------------------------------------------------------

/**
 * Side panel for one combatant during real-time combat. The fight itself is
 * drawn on the strategic board (see drawBoard / boardUnits).
 */
export function drawCombatPanel(ctx: Ctx, state: GameState, owner: PlayerId, r: Rect): void {
  const b = state.battle!;
  const combat = b.combat!;
  const f = Object.values(combat.fighters).find((x) => state.creatures[x.creatureId].owner === owner);
  if (!f) return;
  const info = sideInfo(state, f.side);
  panel(ctx, r, info.color);
  badge(ctx, r.x + 20, r.y + 22, 14, owner, info.color);
  text(ctx, playerLabel(owner), r.x + 34, r.y + 27, { size: 16, color: info.color });
  text(ctx, f.side.toUpperCase(), r.x + r.w - 14, r.y + 27, { size: 11, color: C.dim, align: 'right' });
  text(ctx, info.def.name.toUpperCase(), r.x + 14, r.y + 60, { size: 16, color: C.text });
  text(ctx, `${f.hp}/${f.maxHp}`, r.x + r.w - 14, r.y + 60, { size: 16, align: 'right', color: f.hp <= f.maxHp / 4 ? C.danger : C.text });
  hpBar(ctx, { x: r.x + 14, y: r.y + 70, w: r.w - 28, h: 12 }, f.hp, f.maxHp, info.color);
  let y = r.y + 112;
  for (const [label, v] of [['POWER', f.stats.power], ['SHIELD', f.stats.shield], ['SPEED', f.stats.speed]] as const) {
    text(ctx, label, r.x + 14, y, { size: 12, color: C.dim });
    text(ctx, String(v), r.x + 104, y, { size: 14 });
    y += 20;
  }
  text(ctx, 'GUARD', r.x + 14, y, { size: 12, color: C.dim });
  for (let k = 0; k < f.blockCharges; k++) rect(ctx, { x: r.x + 104 + k * 13, y: y - 10, w: 10, h: 10 }, C.pp);
  if (f.blockCharges === 0) text(ctx, '-', r.x + 104, y, { size: 14, color: C.faint });
  y += 20;
  text(ctx, 'ATTACK', r.x + 14, y, { size: 12, color: C.dim });
  const ready = f.cooldown === 0 && f.windup === 0;
  text(ctx, ready ? 'READY' : f.windup > 0 ? 'SWING' : 'RELOAD', r.x + 104, y, { size: 13, color: ready ? C.ok : C.dim });
  const build = b.builds![f.side];
  if (build.specialName) {
    text(ctx, `${build.specialName.toUpperCase()}: ${build.specialActive ? 'ACTIVE' : 'OFF'}`, r.x + 14, y + 32, {
      size: 12,
      color: build.specialActive ? C.ok : C.faint,
    });
  }
  const keys = owner === 'P1' ? ['WASD  MOVE', 'SPACE  HIT', 'L-SHIFT  GUARD'] : ['ARROWS  MOVE', 'ENTER  HIT', 'R-SHIFT  GUARD'];
  keys.forEach((k, i) => text(ctx, k, r.x + 14, r.y + r.h - 56 + i * 18, { size: 11, color: C.dim }));
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
  return `COMBAT ON THE BOARD  ·  ${playerLabel(a)} ATTACKS${t !== null ? `  ·  TIME ${t}` : ''}`;
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
